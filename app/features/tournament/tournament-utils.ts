import { sub } from "date-fns";
import * as R from "remeda";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { weekNumberToDate } from "~/utils/dates";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import type {
	CastedMatchesInfo,
	Tables,
	TournamentStageSettings,
} from "../../db/tables";
import { assertUnreachable } from "../../utils/types";
import { MapPool } from "../map-list-generator/core/map-pool";
import { BANNED_MAPS } from "../match-profile/banned-maps";
import * as Seasons from "../mmr/core/Seasons";
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

/**
 * Whether a tournament's startTime falls inside the active weapon-reporting window
 * for late (post-finalization) reporting.
 *
 * - In-season: window is `(previousSeason.ends, now]` — current season plus the off-season immediately before it.
 * - Off-season: window is `[previousSeason.starts, now]` — previous full season plus the current off-season.
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

const EARLIEST_TIMEZONE_OFFSET_HOURS = 14;

export function isLeagueRoundLocked(
	tournament: TournamentClass,
	roundId: number,
) {
	const date = resolveLeagueRoundStartDate(tournament, roundId);

	if (!date) return false;

	return sub(date, { hours: EARLIEST_TIMEZONE_OFFSET_HOURS }) > new Date();
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

	if (a.seed !== null && b.seed !== null) {
		return a.seed - b.seed;
	}

	const aIsFull = a.members.length >= minMembersPerTeam;
	const bIsFull = b.members.length >= minMembersPerTeam;

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

const LEADING_SEPARATOR_REGEX = /^[\s_-]+/;

/**
 * Splits a tournament name into its series name and a trailing "subtext"
 * (e.g. an edition number like `"54"` or a date like `"May 2026"`) based on the
 * names of the organization's tournament series.
 *
 * The longest series name that the tournament name starts with (case-insensitive)
 * is treated as the base name and whatever follows it becomes the subtext. If the
 * tournament name does not start with any of the series names, the whole name is
 * returned with no subtext.
 *
 * @example
 * // series: [{ name: "In The Zone" }]
 * splitTournamentName("In The Zone 54", series)     // { name: "In The Zone", subtext: "54" }
 * splitTournamentName("In The Zone Winter", series) // { name: "In The Zone", subtext: "Winter" }
 * splitTournamentName("Picnic Weekly", series)      // { name: "Picnic Weekly" }
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

/**
 * Resolves the display name and subtext for a tournament's identity.
 *
 * For a league division the parent tournament name is used as the base name and
 * the division name (e.g. `"Division 1"`) becomes the subtext. For all other
 * tournaments the split is based on the organization's tournament series.
 *
 * @see {@link splitTournamentName}
 */
export function tournamentNameParts(tournament: TournamentClass): {
	name: string;
	subtext?: string;
} {
	if (tournament.isLeagueDivision && tournament.ctx.parentTournamentName) {
		return splitTournamentName(tournament.ctx.name, [
			{ name: tournament.ctx.parentTournamentName },
		]);
	}

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
 * Builds a compact label describing the bracket progression of a tournament,
 * derived from `settings.bracketProgression`.
 *
 * Each stage type is rendered as a short code (`RR`, `SE`, `DE`, `SW`). Main progression stages are
 * arrow-separated with consecutive duplicates collapsed (e.g. two single-elimination stages still
 * render as a single `SE`).
 *
 * Underground brackets are not part of the main progression — they give early losers another chance
 * to play. When present the whole label is tagged `(UG)` once. An underground bracket type that does
 * not already appear in the main progression is also surfaced with `+ {code}`, while repeated
 * underground brackets of an already-shown type are collapsed away to keep the label compact.
 *
 * @example
 * // [{type: "round_robin"}, {type: "single_elimination"}, ...underground SE brackets]
 * bracketProgressionLabel(progression) // "RR → SE (UG)"
 * // [{type: "double_elimination"}, {type: "single_elimination", sources: [...]}]
 * bracketProgressionLabel(progression) // "DE + SE (UG)"
 */
export function bracketProgressionLabel(progression: ParsedBracket[]): string {
	if (progression.length === 0) return "";

	const mainCodes: string[] = [];
	const undergroundCodes: string[] = [];
	for (let i = 0; i < progression.length; i++) {
		const code = STAGE_TYPE_TO_SHORT_CODE[progression[i].type];
		const codes = Progression.isUnderground(i, progression)
			? undergroundCodes
			: mainCodes;
		if (codes.at(-1) !== code) {
			codes.push(code);
		}
	}

	const mainLabel = mainCodes.join(" → ");

	if (undergroundCodes.length === 0) return mainLabel;

	const extraCodes = undergroundCodes.filter(
		(code) => !mainCodes.includes(code),
	);

	const label =
		extraCodes.length > 0 ? [mainLabel, ...extraCodes].join(" + ") : mainLabel;

	return `${label} (UG)`;
}

/**
 * Returns a new `CastedMatchesInfo` with the cast assignment applied. Tracks history of streamed set per channel.
 * Deduplicates history by `matchId` so that correcting a wrong channel replaces the previous entry.
 *
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
					// currently a match can only be streamed by one account
					// and a cast can only stream one match at a time
					// these can change in the future
					cm.matchId !== matchId && cm.twitchAccount !== twitchAccount,
			)
			.concat([{ twitchAccount, matchId }]),
		lockedMatches: current.lockedMatches.filter((lm) => lm.matchId !== matchId),
		castedMatchHistory: existingHistory
			.filter((entry) => entry.matchId !== matchId)
			.concat([{ twitchAccount, matchId, timestamp }]),
	};
}
