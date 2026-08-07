import { hoursToMilliseconds } from "date-fns";
import * as R from "remeda";
import type { PreparedMaps } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { nullFilledArray } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type { Bracket } from "./Bracket";
import * as Engine from "./engine";
import type { BracketData } from "./engine/types";
import * as Progression from "./Progression";
import type { BracketMeta, Tournament } from "./Tournament";

/** Returns the prepared maps for one exact bracket index OR maps of a "sibling bracket" i.e. bracket that has the same depth in progression  */
export function resolvePreparedForTheBracket({
	preparedByBracket,
	bracketIdx,
	tournament,
}: {
	preparedByBracket?: (PreparedMaps | null)[];
	bracketIdx: number;
	tournament: Tournament;
}) {
	const bracketMaps = preparedByBracket?.[bracketIdx];

	// maps exactly for this bracket have been prepared, use them
	if (bracketMaps) {
		return bracketMaps;
	}

	const bracketPreparingFor = tournament.bracketByIdx(bracketIdx)!;
	const bracketProgression = tournament.ctx.settings.bracketProgression;
	const targetDepth = Progression.bracketDepth(bracketIdx, bracketProgression);

	// lets look for an "equivalent" prepared bracket to use
	// e.g. SoS RR -> 4x SE style the SE brackets can share maps
	for (const [anotherBracketIdx, bracket] of bracketProgression.entries()) {
		const depth = Progression.bracketDepth(
			anotherBracketIdx,
			bracketProgression,
		);

		if (
			bracket.type === bracketPreparingFor.type &&
			depth === targetDepth &&
			R.isDeepEqual(bracket.settings, bracketPreparingFor.settings)
		) {
			const bracketMaps = preparedByBracket?.[anotherBracketIdx];

			if (bracketMaps) {
				return bracketMaps;
			}
		}
	}

	return null;
}

export type EliminationBracketType =
	| "single_elimination"
	| "double_elimination";

interface TeamCountRange {
	min: number;
	max: number;
}

/** A round is only added once the bracket size doubles. Three teams playing without a third place match is handled by trimming instead. */
const SINGLE_ELIMINATION_TEAM_RANGES: readonly TeamCountRange[] = [
	{ min: 2, max: 2 },
	{ min: 3, max: 4 },
	{ min: 5, max: 8 },
	{ min: 9, max: 16 },
	{ min: 17, max: 32 },
	{ min: 33, max: 64 },
	{ min: 65, max: 128 },
	{ min: 129, max: 256 },
];

/** Below three quarters of the bracket size the loser bracket loses its first round to byes, so every power of two splits in two. */
const DOUBLE_ELIMINATION_TEAM_RANGES: readonly TeamCountRange[] = [
	{ min: 2, max: 2 },
	{ min: 3, max: 3 },
	{ min: 4, max: 4 },
	{ min: 5, max: 6 },
	{ min: 7, max: 8 },
	{ min: 9, max: 12 },
	{ min: 13, max: 16 },
	{ min: 17, max: 24 },
	{ min: 25, max: 32 },
	{ min: 33, max: 48 },
	{ min: 49, max: 64 },
	{ min: 65, max: 96 },
	{ min: 97, max: 128 },
	{ min: 129, max: 192 },
	{ min: 193, max: 256 },
];

/** For single elimination and double elimination returns the amount of options that are the "steps" that affect the round count. Takes in currentCount as an argument, filtering out counts below that.  */
export function eliminationTeamCountOptions({
	type,
	currentCount,
}: {
	type: EliminationBracketType;
	currentCount: number;
}) {
	const ranges =
		type === "double_elimination"
			? DOUBLE_ELIMINATION_TEAM_RANGES
			: SINGLE_ELIMINATION_TEAM_RANGES;

	return ranges.filter(({ max }) => max >= currentCount);
}

/** Validates that given count is a known "max" elimination team count value */
export function isValidMaxEliminationTeamCount(count: number) {
	return [
		...SINGLE_ELIMINATION_TEAM_RANGES,
		...DOUBLE_ELIMINATION_TEAM_RANGES,
	].some(({ max }) => max === count);
}

/** Registration closing within this window means the teams registered are a good enough basis for an estimate. */
const REGISTRATION_CLOSING_SOON_MS = hoursToMilliseconds(1);

/** How big a share of a team count range must be unfilled for an estimated count not to be rounded up to the next range. */
const ESTIMATE_SLACK_RATIO = 0.1;

/**
 * Team count to prefill the "expected teams" selection with when preparing maps for an elimination bracket.
 * Null when it can't be told yet how many teams will play in the bracket e.g. registration is still open.
 */
export function eliminationTeamCountPrefill({
	tournament,
	bracketIdx,
}: {
	tournament: Tournament;
	bracketIdx: number;
}): number | null {
	const bracket = tournament.bracketMetaByIdx(bracketIdx);
	if (
		bracket?.type !== "single_elimination" &&
		bracket?.type !== "double_elimination"
	) {
		return null;
	}

	const expected = expectedTeamCount({ tournament, bracketIdx });
	if (!expected || expected.count < TOURNAMENT.ENOUGH_TEAMS_TO_START) {
		return null;
	}

	const [smallestFitting, nextUp] = eliminationTeamCountOptions({
		type: bracket.type,
		currentCount: expected.count,
	});
	if (!smallestFitting) return null;
	if (expected.isExact) return smallestFitting.max;

	const unfilledShare =
		(smallestFitting.max - expected.count) / smallestFitting.max;

	return unfilledShare >= ESTIMATE_SLACK_RATIO
		? smallestFitting.max
		: (nextUp?.max ?? smallestFitting.max);
}

interface TrimPreparedEliminationMapsAgs {
	preparedMaps: PreparedMaps | null;
	teamCount: number;
	bracket: Bracket;
}

/** Trim prepared elimination bracket maps to match the actual number. If not prepared or prepared for too few returns null */
export function trimPreparedEliminationMaps({
	preparedMaps,
	teamCount,
	...rest
}: TrimPreparedEliminationMapsAgs) {
	if (!preparedMaps) {
		// we did not prepare enough maps
		return null;
	}

	// only elimination brackets have prepared maps to trim, defensive check
	if (
		rest.bracket.type !== "single_elimination" &&
		rest.bracket.type !== "double_elimination"
	) {
		return null;
	}

	// eliminationTeamCount should exist here, defensive check
	if (
		!preparedMaps.eliminationTeamCount ||
		preparedMaps.eliminationTeamCount < teamCount
	) {
		// we did not prepared enough maps
		return null;
	}

	const isPerfectCountMatch =
		preparedMaps.eliminationTeamCount ===
		eliminationTeamCountOptions({
			type: rest.bracket.type,
			currentCount: teamCount,
		})[0].max;

	if (isPerfectCountMatch) {
		if (thirdPlaceMatchDisappeared({ preparedMaps, teamCount, ...rest })) {
			return filterOutThirdPlaceMatch(preparedMaps);
		}

		return preparedMaps;
	}

	return trimMapsByTeamCount({ preparedMaps, teamCount, ...rest });
}

function trimMapsByTeamCount({
	preparedMaps,
	teamCount,
	bracket,
}: TrimPreparedEliminationMapsAgs & { preparedMaps: PreparedMaps }) {
	const actualRounds = bracket.generateMatchesData(
		nullFilledArray(teamCount).map((_, i) => i + 1),
	).round;

	const groupIds = R.unique(preparedMaps.maps.map((r) => r.groupId));

	const result = { ...preparedMaps };
	for (const groupId of groupIds) {
		const actualRoundsForGroup = actualRounds.filter(
			(r) => r.groupId === groupId,
		);

		const preparedRoundsForGroup = preparedMaps.maps.filter(
			(r) => r.groupId === groupId,
		);

		const actualRoundsCount = actualRoundsForGroup.length;

		const trimmedRounds = roundsWithVirtualIds(
			preparedRoundsForGroup.slice(
				preparedRoundsForGroup.length - actualRoundsCount,
			),
			actualRoundsForGroup.map((r) => r.id).sort((a, b) => a - b),
		);

		result.maps = result.maps.filter((r) => r.groupId !== groupId);
		result.maps.push(...trimmedRounds);
	}

	result.maps.sort((a, b) => {
		if (a.groupId === b.groupId) {
			return a.roundId - b.roundId;
		}

		return a.groupId - b.groupId;
	});

	return result;
}

function roundsWithVirtualIds<T extends { roundId: number }>(
	rounds: T[],
	virtualIds: number[],
) {
	invariant(rounds.length === virtualIds.length, "Round id length mismatch");

	return rounds.map((r, i) => ({ ...r, roundId: virtualIds[i] }));
}

function thirdPlaceMatchDisappeared({
	bracket,
	preparedMaps,
	teamCount,
}: TrimPreparedEliminationMapsAgs & { preparedMaps: PreparedMaps }) {
	if (
		bracket.type !== "single_elimination" ||
		!bracket.settings?.thirdPlaceMatch
	) {
		return false;
	}

	const preparedHasThirdPlace =
		R.unique(preparedMaps.maps.map((r) => r.groupId)).length > 1;

	return preparedHasThirdPlace && teamCount < 4;
}

function filterOutThirdPlaceMatch(prepared: PreparedMaps): PreparedMaps {
	return {
		...prepared,
		maps: prepared.maps.filter((map) => map.groupId === 0),
	};
}

interface ExpectedTeamCount {
	count: number;
	/** False when teams can still join, meaning the count can only grow from what it is now */
	isExact: boolean;
}

function expectedTeamCount({
	tournament,
	bracketIdx,
}: {
	tournament: Tournament;
	bracketIdx: number;
}): ExpectedTeamCount | null {
	const bracket = tournament.bracketMetaByIdx(bracketIdx);
	if (!bracket) return null;

	if (!bracket.preview) {
		return {
			count: bracket.participantTournamentTeamIds.length,
			isExact: true,
		};
	}

	if (bracket.sources && bracket.sources.length > 0) {
		return advancingTeamCount({ tournament, sources: bracket.sources });
	}

	return registeredTeamCount({ tournament, bracketIdx });
}

function registeredTeamCount({
	tournament,
	bracketIdx,
}: {
	tournament: Tournament;
	bracketIdx: number;
}): ExpectedTeamCount | null {
	const teams = tournament.isMultiStartingBracket
		? tournament.ctx.teams.filter(
				(team) => (team.startingBracketIdx ?? 0) === bracketIdx,
			)
		: tournament.ctx.teams;

	// the organizer adds the teams of an invitational, all of them are expected to play
	if (tournament.isInvitational) {
		return { count: teams.length, isExact: true };
	}

	if (!tournament.registrationOpen) {
		// teams that never filled their roster won't play
		const fullTeams = teams.filter(
			(team) => team.memberUserIds.length >= tournament.minMembersPerTeam,
		);

		return { count: fullTeams.length, isExact: true };
	}

	const closesIn = tournament.registrationClosesAt.getTime() - Date.now();
	if (closesIn > REGISTRATION_CLOSING_SOON_MS) return null;

	return { count: teams.length, isExact: false };
}

function advancingTeamCount({
	tournament,
	sources,
}: {
	tournament: Tournament;
	sources: Progression.DBSource[];
}): ExpectedTeamCount | null {
	let count = 0;
	let isExact = true;

	for (const source of sources) {
		const sourceBracket = tournament.bracketMetaByIdx(source.bracketIdx);
		if (!sourceBracket) return null;

		const participants = expectedTeamCount({
			tournament,
			bracketIdx: source.bracketIdx,
		});
		if (!participants) return null;

		const advancing = advancingFromSource({
			bracket: sourceBracket,
			participantCount: participants.count,
			source,
		});
		if (advancing === null) return null;

		count += advancing;
		if (!participants.isExact) isExact = false;
	}

	return { count, isExact };
}

/** How many teams the given source sends forward, based on the shape the source bracket would have with the given participant count. */
function advancingFromSource({
	bracket,
	participantCount,
	source,
}: {
	bracket: BracketMeta;
	participantCount: number;
	source: Progression.DBSource;
}): number | null {
	// swiss early advance, how many advance depends on the results
	if (source.placements.length === 0) return null;
	if (participantCount < TOURNAMENT.ENOUGH_TEAMS_TO_START) return null;

	const data = Engine.create({
		type: bracket.type,
		seeding: nullFilledArray(participantCount).map((_, i) => i + 1),
		settings: bracket.settings,
	});

	if (source.placements.some((placement) => placement < 0)) {
		return eliminatedInFirstRoundsCount({ bracket, data, source });
	}

	const maxExplicit = Math.max(...source.placements);

	return R.sumBy(standingsPlacementSizes({ bracket, data }), (size, index) =>
		source.placements.includes(index + 1) ||
		(source.rest === true && index + 1 >= maxExplicit)
			? size
			: 0,
	);
}

/** How many teams share each successive standings placement e.g. [1, 1, 2, 4] for an 8 team single elimination bracket (1st, 2nd, tied 3rd, tied 5th). */
function standingsPlacementSizes({
	bracket,
	data,
}: {
	bracket: BracketMeta;
	data: BracketData;
}): number[] {
	switch (bracket.type) {
		case "round_robin":
		case "swiss":
			return groupPlacementSizes({
				data,
				hasAbDivisions: bracket.settings?.hasAbDivisions === true,
			});
		case "single_elimination":
		case "double_elimination":
			return eliminationPlacementSizes({ type: bracket.type, data });
	}
}

function groupPlacementSizes({
	data,
	hasAbDivisions,
}: {
	data: BracketData;
	hasAbDivisions: boolean;
}): number[] {
	const sizes: number[] = [];

	for (const group of data.group) {
		const teamsInGroup = R.unique(
			data.match
				.filter((match) => match.groupId === group.id)
				.flatMap((match) => [match.opponent1?.id, match.opponent2?.id])
				.filter((id) => typeof id === "number"),
		).length;

		const teamsPerStandings = hasAbDivisions
			? [Math.ceil(teamsInGroup / 2), Math.floor(teamsInGroup / 2)]
			: [teamsInGroup];

		for (const teamCount of teamsPerStandings) {
			for (let placement = 1; placement <= teamCount; placement++) {
				sizes[placement - 1] = (sizes[placement - 1] ?? 0) + 1;
			}
		}
	}

	return sizes;
}

function eliminationPlacementSizes({
	type,
	data,
}: {
	type: "single_elimination" | "double_elimination";
	data: BracketData;
}): number[] {
	// the winner is not eliminated in any round, in double elimination neither is the team that lost the grand finals
	const winnersSizes = type === "double_elimination" ? [1, 1] : [1];

	const sizes = [
		...winnersSizes,
		...eliminationRounds({ type, data })
			.map((round) => nonByeMatchCount({ data, roundId: round.id }))
			.reverse(),
	].filter((size) => size > 0);

	const thirdPlaceMatchExists =
		type === "single_elimination" && data.group.length > 1;
	const semiFinalLosersIdx = 2;
	if (thirdPlaceMatchExists && sizes[semiFinalLosersIdx] === 2) {
		// the third place match splits the semi final losers into 3rd and 4th
		sizes.splice(semiFinalLosersIdx, 1, 1, 1);
	}

	return sizes;
}

/** How many teams the given negative placements (e.g. losers of the first two rounds) source. */
function eliminatedInFirstRoundsCount({
	bracket,
	data,
	source,
}: {
	bracket: BracketMeta;
	data: BracketData;
	source: Progression.DBSource;
}): number | null {
	if (
		bracket.type !== "single_elimination" &&
		bracket.type !== "double_elimination"
	) {
		return null;
	}

	const rounds = eliminationRounds({ type: bracket.type, data });
	const firstRoundIsOnlyByes =
		bracket.type === "double_elimination" &&
		rounds.length > 0 &&
		nonByeMatchCount({ data, roundId: rounds[0].id }) === 0;

	const roundCount =
		Math.abs(Math.min(...source.placements)) + (firstRoundIsOnlyByes ? 1 : 0);

	return R.sumBy(rounds.slice(0, roundCount), (round) =>
		nonByeMatchCount({ data, roundId: round.id }),
	);
}

/** Rounds where the teams of the bracket get eliminated, in the order they are played. */
function eliminationRounds({
	type,
	data,
}: {
	type: "single_elimination" | "double_elimination";
	data: BracketData;
}) {
	const groupIds = R.unique(data.round.map((round) => round.groupId));
	// third place match lives in a separate (higher) group, as does the losers bracket
	const groupId =
		type === "double_elimination"
			? Math.min(...groupIds) + 1
			: Math.min(...groupIds);

	return data.round
		.filter((round) => round.groupId === groupId)
		.sort((a, b) => a.id - b.id);
}

function nonByeMatchCount({
	data,
	roundId,
}: {
	data: BracketData;
	roundId: number;
}) {
	return data.match.filter(
		(match) => match.roundId === roundId && match.opponent1 && match.opponent2,
	).length;
}
