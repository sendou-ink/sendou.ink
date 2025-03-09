import compare from "just-compare";
import type { PreparedMaps } from "~/db/tables";
import { nullFilledArray, removeDuplicates } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type { Bracket } from "./Bracket";
import type { Tournament } from "./Tournament";

/** Returns the prepared maps for one exact bracket index OR maps of a "sibling bracket" i.e. bracket that has the same sources  */
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

	// lets look for an "equivalent" prepared bracket to use
	// e.g. SoS RR -> 4x SE style the SE brackets can share maps
	for (const [
		anotherBracketIdx,
		bracket,
	] of tournament.ctx.settings.bracketProgression.entries()) {
		if (
			bracket.type === bracketPreparingFor.type &&
			compare(
				bracket.sources?.map((s) => s.bracketIdx),
				bracketPreparingFor.sources?.map((s) => s.bracketIdx),
			) &&
			compare(bracket.settings, bracketPreparingFor.settings)
		) {
			const bracketMaps = preparedByBracket?.[anotherBracketIdx];

			if (bracketMaps) {
				return bracketMaps;
			}
		}
	}

	return null;
}
const ELIMINATION_BRACKET_TEAM_RANGES = [
	{ min: 2, max: 2 },
	{ min: 3, max: 4 },
	{ min: 5, max: 8 },
	{ min: 9, max: 16 },
	{ min: 17, max: 32 },
	{ min: 33, max: 64 },
	{ min: 65, max: 128 },
	{ min: 129, max: 256 },
] as const;

/** For single elimination and double elimination returns the amount of options that are the "steps" that affect the round count. Takes in currentCount as an argument, filtering out counts below that.  */
export function eliminationTeamCountOptions(currentCount: number) {
	return ELIMINATION_BRACKET_TEAM_RANGES.filter(
		({ max }) => max >= currentCount,
	);
}

/** Validates that given count is a known "max" elimination team count value */
export function isValidMaxEliminationTeamCount(count: number) {
	return ELIMINATION_BRACKET_TEAM_RANGES.some(({ max }) => max === count);
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
		eliminationTeamCountOptions(teamCount)[0].max;

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

	const groupIds = removeDuplicates(preparedMaps.maps.map((r) => r.groupId));

	const result = { ...preparedMaps };
	for (const groupId of groupIds) {
		const actualRoundsForGroup = actualRounds.filter(
			(r) => r.group_id === groupId,
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
		removeDuplicates(preparedMaps.maps.map((r) => r.groupId)).length > 1;

	return preparedHasThirdPlace && teamCount < 4;
}

function filterOutThirdPlaceMatch(prepared: PreparedMaps): PreparedMaps {
	return {
		...prepared,
		maps: prepared.maps.filter((map) => map.groupId === 0),
	};
}
