import * as R from "remeda";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { weekNumberToDate } from "~/utils/dates";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import type { Tables, TournamentStageSettings } from "../../db/tables";
import { assertUnreachable } from "../../utils/types";
import { MapPool } from "../map-list-generator/core/map-pool";
import * as Seasons from "../mmr/core/Seasons";
import { BANNED_MAPS } from "../sendouq-settings/banned-maps";
import type { ParsedBracket } from "../tournament-bracket/core/Progression";
import * as Progression from "../tournament-bracket/core/Progression";
import type { Tournament as TournamentClass } from "../tournament-bracket/core/Tournament";
import type { TournamentData } from "../tournament-bracket/core/Tournament.server";
import { LEAGUES, TOURNAMENT } from "./tournament-constants";

const mapPickingStyleToModeRecord = {
	AUTO_SZ: ["SZ"],
	AUTO_TC: ["TC"],
	AUTO_RM: ["RM"],
	AUTO_CB: ["CB"],
	AUTO_ALL: rankedModesShort,
} as const;

export const mapPickingStyleToModes = (
	mapPickingStyle: Exclude<Tables["Tournament"]["mapPickingStyle"], "TO">,
) => {
	return mapPickingStyleToModeRecord[mapPickingStyle].slice();
};

export function modesIncluded(
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"],
	toSetMapPool: Array<{ mode: ModeShort }>,
): ModeShort[] {
	if (mapPickingStyle !== "TO") {
		return mapPickingStyleToModes(mapPickingStyle);
	}

	const pickedModes = R.unique(toSetMapPool.map((map) => map.mode));

	// fallback
	if (pickedModes.length === 0) {
		return [...rankedModesShort];
	}

	return pickedModes.sort(
		(a, b) => modesShort.indexOf(a) - modesShort.indexOf(b),
	);
}

export function isOneModeTournamentOf(
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"],
	toSetMapPool: Array<{ mode: ModeShort }>,
) {
	return modesIncluded(mapPickingStyle, toSetMapPool).length === 1
		? modesIncluded(mapPickingStyle, toSetMapPool)[0]
		: null;
}

export type CounterPickValidationStatus =
	| "PICKING"
	| "VALID"
	| "TOO_MUCH_STAGE_REPEAT"
	| "STAGE_REPEAT_IN_SAME_MODE"
	| "INCLUDES_BANNED"
	| "INCLUDES_TIEBREAKER";

export function validateCounterPickMapPool(
	mapPool: MapPool,
	isOneModeOnlyTournamentFor: ModeShort | null,
	tieBreakerMapPool: TournamentData["ctx"]["tieBreakerMapPool"],
): CounterPickValidationStatus {
	const stageCounts = new Map<StageId, number>();
	for (const stageId of mapPool.stages) {
		if (!stageCounts.has(stageId)) {
			stageCounts.set(stageId, 0);
		}

		if (
			stageCounts.get(stageId)! >= TOURNAMENT.COUNTERPICK_MAX_STAGE_REPEAT ||
			(isOneModeOnlyTournamentFor && stageCounts.get(stageId)! >= 1)
		) {
			return "TOO_MUCH_STAGE_REPEAT";
		}

		stageCounts.set(stageId, stageCounts.get(stageId)! + 1);
	}

	if (
		new MapPool(mapPool.serialized).stageModePairs.length !==
		mapPool.stageModePairs.length
	) {
		return "STAGE_REPEAT_IN_SAME_MODE";
	}

	if (
		mapPool.stageModePairs.some((pair) =>
			BANNED_MAPS[pair.mode].includes(pair.stageId),
		)
	) {
		return "INCLUDES_BANNED";
	}

	if (
		mapPool.stageModePairs.some((pair) =>
			tieBreakerMapPool.some(
				(stage) => stage.mode === pair.mode && stage.stageId === pair.stageId,
			),
		)
	) {
		return "INCLUDES_TIEBREAKER";
	}

	if (
		!isOneModeOnlyTournamentFor &&
		(mapPool.parsed.SZ.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
			mapPool.parsed.TC.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
			mapPool.parsed.RM.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
			mapPool.parsed.CB.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE)
	) {
		return "PICKING";
	}

	if (
		isOneModeOnlyTournamentFor &&
		mapPool.parsed[isOneModeOnlyTournamentFor].length !==
			TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
	) {
		return "PICKING";
	}

	return "VALID";
}

export function tournamentIsRanked({
	isSetAsRanked,
	startTime,
	minMembersPerTeam,
	isTest,
}: {
	isSetAsRanked?: boolean;
	startTime: Date;
	minMembersPerTeam: number;
	isTest: boolean;
}) {
	if (isTest) return false;

	const seasonIsActive = Boolean(Seasons.current(startTime));
	if (!seasonIsActive) return false;

	// 1v1, 2v2 and 3v3 are always considered "gimmicky"
	if (minMembersPerTeam !== 4) return false;

	return isSetAsRanked ?? true;
}

export function resolveLeagueRoundStartDate(
	tournament: TournamentClass,
	roundId: number,
) {
	if (!tournament.isLeagueDivision) return null;

	const league = Object.values(LEAGUES)
		.flat()
		.find(
			(league) => league.tournamentId === tournament.ctx.parentTournamentId,
		);
	if (!league) return null;

	const bracket = tournament.brackets.find((b) =>
		b.data.round.some((r) => r.id === roundId),
	);

	const round = bracket?.data.round.find((r) => r.id === roundId);
	const onlyRelevantRounds = bracket?.data.round.filter(
		(r) => r.group_id === round?.group_id,
	);

	const roundIdx = onlyRelevantRounds?.findIndex((r) => r.id === roundId);
	if (roundIdx === undefined) return null;

	const week = league.weeks[roundIdx];
	if (!week) return null;

	const date = weekNumberToDate({
		week: week.weekNumber,
		year: week.year,
	});

	return date;
}

export function defaultBracketSettings(
	type: Tables["TournamentStage"]["type"],
): TournamentStageSettings {
	switch (type) {
		case "single_elimination": {
			return {
				thirdPlaceMatch: true,
			};
		}
		case "double_elimination": {
			return {};
		}
		case "round_robin": {
			return {
				teamsPerGroup: 4,
			};
		}
		case "swiss": {
			return {
				roundCount: 5,
				groupCount: 1,
			};
		}
		case "double_elimination_groups": {
			return {
				teamsPerGroup: 4,
			};
		}
		default: {
			assertUnreachable(type);
		}
	}
}

export function validateCanJoinTeam({
	inviteCode,
	teamToJoin,
	userId,
	maxTeamSize,
}: {
	inviteCode?: string | null;
	teamToJoin?: { members: { userId: number }[] };
	userId?: number;
	maxTeamSize: number;
}) {
	if (typeof inviteCode !== "string") {
		return "MISSING_CODE";
	}
	if (typeof userId !== "number") {
		return "NOT_LOGGED_IN";
	}
	if (!teamToJoin && inviteCode.length !== SHORT_NANOID_LENGTH) {
		return "SHORT_CODE";
	}
	if (!teamToJoin) {
		return "NO_TEAM_MATCHING_CODE";
	}
	if (teamToJoin.members.length >= maxTeamSize) {
		return "TEAM_FULL";
	}
	if (teamToJoin.members.some((member) => member.userId === userId)) {
		return "ALREADY_JOINED";
	}

	return "VALID";
}

export function normalizedTeamCount({
	teamsCount,
	minMembersPerTeam,
}: {
	teamsCount: number;
	minMembersPerTeam: number;
}) {
	return teamsCount * minMembersPerTeam;
}

export type TeamForOrdering = {
	id: number;
	seed: number | null;
	members: { length: number };
	avgSeedingSkillOrdinal: number | null;
	createdAt: number;
	startingBracketIdx: number | null;
};

export function compareTeamsForOrdering(
	a: TeamForOrdering,
	b: TeamForOrdering,
	minMembersPerTeam: number,
): number {
	if (a.startingBracketIdx !== b.startingBracketIdx) {
		return (a.startingBracketIdx ?? 0) - (b.startingBracketIdx ?? 0);
	}

	const aIsFull = a.members.length >= minMembersPerTeam;
	const bIsFull = b.members.length >= minMembersPerTeam;

	if (aIsFull && !bIsFull) {
		return -1;
	}
	if (!aIsFull && bIsFull) {
		return 1;
	}

	if (a.seed !== null && b.seed !== null) {
		return a.seed - b.seed;
	}

	if (
		a.avgSeedingSkillOrdinal !== b.avgSeedingSkillOrdinal &&
		a.avgSeedingSkillOrdinal !== null &&
		b.avgSeedingSkillOrdinal !== null
	) {
		return b.avgSeedingSkillOrdinal - a.avgSeedingSkillOrdinal;
	}

	return a.createdAt - b.createdAt;
}

export function sortTeamsBySeeding<T extends TeamForOrdering>(
	teams: T[],
	minMembersPerTeam: number,
): T[] {
	return [...teams].sort((a, b) =>
		compareTeamsForOrdering(a, b, minMembersPerTeam),
	);
}

export function findTeamInsertPosition<T extends TeamForOrdering>(
	existingOrder: number[],
	newTeam: T,
	teamMap: Map<number, T>,
	minMembersPerTeam: number,
): number {
	for (let i = 0; i < existingOrder.length; i++) {
		const existingTeam = teamMap.get(existingOrder[i]);
		if (!existingTeam) continue;

		if (compareTeamsForOrdering(newTeam, existingTeam, minMembersPerTeam) < 0) {
			return i;
		}
	}
	return existingOrder.length;
}

export function getBracketProgressionLabel(
	startingBracketIdx: number,
	progression: ParsedBracket[],
): string {
	const reachableBracketIdxs = Progression.bracketsReachableFrom(
		startingBracketIdx,
		progression,
	);

	const uniqueBracketIdxs = Array.from(new Set(reachableBracketIdxs));
	const bracketNames = uniqueBracketIdxs.map((idx) => progression[idx].name);

	if (bracketNames.length === 1) {
		return bracketNames[0];
	}

	let prefix = bracketNames[0];
	for (let i = 1; i < bracketNames.length; i++) {
		const name = bracketNames[i];
		let j = 0;
		while (j < prefix.length && j < name.length && prefix[j] === name[j]) {
			j++;
		}
		prefix = prefix.substring(0, j);
		if (prefix === "") break;
	}

	prefix = prefix.trim();

	if (!prefix) {
		const deepestBracketIdx = uniqueBracketIdxs.reduce((deepest, current) => {
			const currentDepth = Progression.bracketDepth(current, progression);
			const deepestDepth = Progression.bracketDepth(deepest, progression);
			return currentDepth > deepestDepth ? current : deepest;
		}, uniqueBracketIdxs[0]);

		return progression[deepestBracketIdx].name;
	}

	return prefix;
}
