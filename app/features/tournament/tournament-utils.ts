import { sub } from "date-fns";
import * as R from "remeda";
import type { CastedMatchesInfo } from "~/db/tables-json";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import type { Tables } from "../../db/tables";
import { MapPool } from "../map-list-generator/core/map-pool";
import { BANNED_MAPS } from "../match-profile/banned-maps";
import * as Seasons from "../mmr/core/Seasons";
import type { Bracket as BracketClass } from "../tournament-bracket/core/Bracket";
import type { ParsedBracket } from "../tournament-bracket/core/Progression";
import * as Progression from "../tournament-bracket/core/Progression";
import type { Tournament as TournamentClass } from "../tournament-bracket/core/Tournament";
import type { TournamentData } from "../tournament-bracket/core/Tournament.server";
import { TOURNAMENT } from "./tournament-constants";

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
	startsAt,
	minMembersPerTeam,
	isTest,
}: {
	isSetAsRanked?: boolean;
	startsAt: Date;
	minMembersPerTeam: number;
	isTest: boolean;
}) {
	if (isTest) return false;

	const seasonIsActive = Boolean(Seasons.current(startsAt));
	if (!seasonIsActive) return false;

	// 1v1, 2v2 and 3v3 are always considered "gimmicky"
	if (minMembersPerTeam !== 4) return false;

	return isSetAsRanked ?? true;
}

/**
 * Whether a tournament's start time allows late (post-finalization) weapon reporting.
 * In-season the window is `(previousSeason.ends, now]`, off-season `[previousSeason.starts, now]`.
 */
export function tournamentInWeaponReportingWindow({
	tournamentStartTime,
	now = new Date(),
}: {
	tournamentStartTime: Date;
	now?: Date;
}) {
	const previousSeason = Seasons.previous(now);
	if (!previousSeason) return true;

	const currentSeason = Seasons.current(now);
	const windowStart = currentSeason
		? previousSeason.ends
		: previousSeason.starts;

	return tournamentStartTime > windowStart;
}

/** Datetime the league round is played by default, or null if the round has no default play time. */
export function resolveLeagueRoundStartDate(
	tournament: TournamentClass,
	bracket: BracketClass | undefined,
	roundId: number,
) {
	if (!tournament.isLeague) return null;

	const round = bracket?.data.round.find((r) => r.id === roundId);
	if (!round?.defaultPlayTime) return null;

	return databaseTimestampToDate(round.defaultPlayTime);
}

const EARLIEST_TIMEZONE_OFFSET_HOURS = 14;

export function isLeagueRoundLocked(
	tournament: TournamentClass,
	roundId: number,
) {
	const bracket = tournament.brackets.find((b) =>
		b.data.round.some((r) => r.id === roundId),
	);
	const date = resolveLeagueRoundStartDate(tournament, bracket, roundId);

	if (!date) return false;

	return sub(date, { hours: EARLIEST_TIMEZONE_OFFSET_HOURS }) > new Date();
}

export function validateCanJoinTeam({
	inviteCode,
	teamToJoin,
	userId,
	maxTeamSize,
}: {
	inviteCode?: string | null;
	teamToJoin?: { memberUserIds: number[] };
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
	if (teamToJoin.memberUserIds.includes(userId)) {
		return "ALREADY_JOINED";
	}
	if (teamToJoin.memberUserIds.length >= maxTeamSize) {
		return "TEAM_FULL";
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
	memberUserIds: { length: number };
	avgSeedingSkillOrdinal: number | null;
	createdAt: number;
	startingBracketIdx: number | null;
};

/**
 * Pairwise team comparison. Not a strict weak order when only one team has a seed (skill is
 * compared instead), so never a raw `sort` comparator over a mixed field — see {@link sortTeamsBySeeding}.
 */
export function compareTeamsForOrdering(
	a: TeamForOrdering,
	b: TeamForOrdering,
	minMembersPerTeam: number,
): number {
	const aStartingBracketIdx = a.startingBracketIdx ?? 0;
	const bStartingBracketIdx = b.startingBracketIdx ?? 0;
	if (aStartingBracketIdx !== bStartingBracketIdx) {
		return aStartingBracketIdx - bStartingBracketIdx;
	}

	if (a.seed !== null && b.seed !== null) {
		return a.seed - b.seed;
	}

	const aIsFull = a.memberUserIds.length >= minMembersPerTeam;
	const bIsFull = b.memberUserIds.length >= minMembersPerTeam;

	if (aIsFull && !bIsFull) {
		return -1;
	}
	if (!aIsFull && bIsFull) {
		return 1;
	}

	if (a.avgSeedingSkillOrdinal !== null && b.avgSeedingSkillOrdinal === null) {
		return -1;
	}
	if (a.avgSeedingSkillOrdinal === null && b.avgSeedingSkillOrdinal !== null) {
		return 1;
	}
	if (
		a.avgSeedingSkillOrdinal !== null &&
		b.avgSeedingSkillOrdinal !== null &&
		a.avgSeedingSkillOrdinal !== b.avgSeedingSkillOrdinal
	) {
		return b.avgSeedingSkillOrdinal - a.avgSeedingSkillOrdinal;
	}

	return a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : a.id - b.id;
}

/**
 * Effective seed order. Within each starting bracket seeded teams keep the organizer's order;
 * unseeded teams (e.g. registered after seeds were saved) slot in by skill below every seeded team
 * with a higher ordinal. Unseeded teams that are not full or have no ordinal go last. Deterministic
 * regardless of input order.
 */
export function sortTeamsBySeeding<T extends TeamForOrdering>(
	teams: T[],
	minMembersPerTeam: number,
): T[] {
	const byStartingBracket = new Map<number, T[]>();
	for (const team of teams) {
		const bracketIdx = team.startingBracketIdx ?? 0;
		const group = byStartingBracket.get(bracketIdx) ?? [];
		group.push(team);
		byStartingBracket.set(bracketIdx, group);
	}

	return [...byStartingBracket.entries()]
		.sort(([a], [b]) => a - b)
		.flatMap(([, group]) => orderTeamsOfBracket(group, minMembersPerTeam));
}

function orderTeamsOfBracket<T extends TeamForOrdering>(
	teams: T[],
	minMembersPerTeam: number,
): T[] {
	const seeded = teams
		.filter((team) => team.seed !== null)
		.sort((a, b) => a.seed! - b.seed!);
	const unseeded = teams
		.filter((team) => team.seed === null)
		.sort((a, b) => compareTeamsForOrdering(a, b, minMembersPerTeam));

	const interleaved = unseeded.filter(
		(team) =>
			team.memberUserIds.length >= minMembersPerTeam &&
			team.avgSeedingSkillOrdinal !== null,
	);
	const appended = unseeded.filter((team) => !interleaved.includes(team));

	const insertionIdx = (team: T) => {
		for (let i = seeded.length - 1; i >= 0; i--) {
			const seededSkill =
				seeded[i].avgSeedingSkillOrdinal ?? Number.NEGATIVE_INFINITY;
			if (seededSkill >= team.avgSeedingSkillOrdinal!) return i + 1;
		}
		return 0;
	};

	const result: T[] = [];
	let unseededIdx = 0;
	for (let seededIdx = 0; seededIdx <= seeded.length; seededIdx++) {
		while (
			unseededIdx < interleaved.length &&
			insertionIdx(interleaved[unseededIdx]) === seededIdx
		) {
			result.push(interleaved[unseededIdx]);
			unseededIdx++;
		}

		if (seededIdx < seeded.length) {
			result.push(seeded[seededIdx]);
		}
	}

	return [...result, ...appended];
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

const LEADING_SEPARATOR_REGEX = /^[\s_-]+/;

/**
 * Splits a tournament name into the longest series name it starts with (case-insensitive) and
 * the trailing subtext; the whole name with no subtext when no series matches.
 *
 * @example
 * // series: [{ name: "In The Zone" }]
 * splitTournamentName("In The Zone 54", series) // { name: "In The Zone", subtext: "54" }
 * splitTournamentName("Picnic Weekly", series)  // { name: "Picnic Weekly" }
 */
export function splitTournamentName(
	tournamentName: string,
	series: Array<{ name: string }>,
): { name: string; subtext?: string } {
	const trimmedName = tournamentName.trim();
	const nameLower = trimmedName.toLowerCase();

	const matchingSeries = R.firstBy(
		series.filter((s) => nameLower.startsWith(s.name.toLowerCase())),
		[(s) => s.name.length, "desc"],
	);

	if (!matchingSeries) return { name: trimmedName };

	const subtext = trimmedName
		.slice(matchingSeries.name.length)
		.replace(LEADING_SEPARATOR_REGEX, "")
		.trim();

	if (!subtext) return { name: matchingSeries.name };

	return { name: matchingSeries.name, subtext };
}

/** Display name and subtext of a tournament based on its organization's series, see {@link splitTournamentName}. */
export function tournamentNameParts(tournament: TournamentClass): {
	name: string;
	subtext?: string;
} {
	return splitTournamentName(
		tournament.ctx.name,
		tournament.ctx.organization?.series ?? [],
	);
}

const STAGE_TYPE_TO_SHORT_CODE: Record<
	Tables["TournamentStage"]["type"],
	string
> = {
	single_elimination: "SE",
	double_elimination: "DE",
	round_robin: "RR",
	swiss: "SW",
};

/**
 * Compact bracket progression label: main stages as short codes (`RR`, `SE`, `DE`, `SW`), arrow
 * separated, consecutive duplicates collapsed. Underground brackets are left out of the label and
 * only reported via `hasUnderground` (for a `+ UG` suffix) so the label has one shape however they
 * are set up. Parallel starting brackets leading to the same shape (league divisions) are described once.
 *
 * @example
 * // [{type: "round_robin"}, {type: "single_elimination"}, ...underground SE brackets]
 * bracketProgressionLabel(progression) // { label: "RR → SE", hasUnderground: true }
 */
export function bracketProgressionLabel(progression: ParsedBracket[]): {
	label: string;
	hasUnderground: boolean;
} {
	return {
		label: labelOfBrackets(labeledBracketIdxs(progression), progression),
		hasUnderground: progression.some((_, idx) =>
			Progression.isUnderground(idx, progression),
		),
	};
}

/** Short code of every given bracket, arrow separated, consecutive duplicates collapsed. */
function labelOfBrackets(bracketIdxs: number[], progression: ParsedBracket[]) {
	const codes: string[] = [];

	for (const idx of bracketIdxs) {
		if (Progression.isUnderground(idx, progression)) continue;

		const code = STAGE_TYPE_TO_SHORT_CODE[progression[idx].type];
		if (codes.at(-1) !== code) {
			codes.push(code);
		}
	}

	return codes.join(" → ");
}

/** Every bracket, or those of one starting bracket when many lead to the same shape. */
function labeledBracketIdxs(progression: ParsedBracket[]) {
	const everyBracketIdx = progression.map((_, idx) => idx);

	const branches = Progression.startingBrackets(progression).map((idx) =>
		Progression.bracketsReachableFrom(idx, progression).sort((a, b) => a - b),
	);
	if (branches.length <= 1) return everyBracketIdx;

	const labels = branches.map((branch) => labelOfBrackets(branch, progression));

	return labels.every((label) => label === labels[0])
		? branches[0]
		: everyBracketIdx;
}

/**
 * New `CastedMatchesInfo` with the cast assignment applied. History is deduplicated by `matchId`
 * so correcting a wrong channel replaces the previous entry.
 */
export function updatedCastedMatchesInfo(
	current: CastedMatchesInfo,
	args: { matchId: number; twitchAccount: string | null; timestamp: number },
): CastedMatchesInfo {
	const { matchId, twitchAccount, timestamp } = args;

	if (twitchAccount === null) {
		return {
			...current,
			castedMatches: current.castedMatches.filter(
				(cm) => cm.matchId !== matchId,
			),
			lockedMatches: current.lockedMatches.filter(
				(lm) => lm.matchId !== matchId,
			),
		};
	}

	const existingHistory = current.castedMatchHistory ?? [];

	return {
		...current,
		castedMatches: current.castedMatches
			.filter(
				(cm) =>
					// for now one account per match and one match per account at a time
					cm.matchId !== matchId && cm.twitchAccount !== twitchAccount,
			)
			.concat([{ twitchAccount, matchId }]),
		lockedMatches: current.lockedMatches.filter((lm) => lm.matchId !== matchId),
		castedMatchHistory: existingHistory
			.filter((entry) => entry.matchId !== matchId)
			.concat([{ twitchAccount, matchId, timestamp }]),
	};
}
