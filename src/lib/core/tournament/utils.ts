import { modesShort, rankedModesShort } from '$lib/constants/in-game/modes';
import type { ModeShort } from '$lib/constants/in-game/types';
import { LEAGUES } from '$lib/constants/tournament';
import { BracketsManager } from '$lib/core/brackets-manager';
import { InMemoryDatabase } from '$lib/core/brackets-memory-db';
import * as Seasons from '$lib/core/mmr/Seasons';
import type { PlayedSet } from '$lib/core/tournament-team/sets.server';
import type { Tables, TournamentStageSettings } from '$lib/server/db/tables';
import { weekNumberToDate } from '$lib/utils/dates';
import { assertUnreachable } from '$lib/utils/types';
import * as R from 'remeda';
import { Tournament as TournamentClass } from './Tournament';

const mapPickingStyleToModeRecord = {
	AUTO_SZ: ['SZ'],
	AUTO_TC: ['TC'],
	AUTO_RM: ['RM'],
	AUTO_CB: ['CB'],
	AUTO_ALL: rankedModesShort
} as const;

export function mapPickingStyleToModes(
	mapPickingStyle: Exclude<Tables['Tournament']['mapPickingStyle'], 'TO'>
) {
	return mapPickingStyleToModeRecord[mapPickingStyle].slice();
}

export function modesIncluded(
	mapPickingStyle: Tables['Tournament']['mapPickingStyle'],
	toSetMapPool: Array<{ mode: ModeShort }>
): ModeShort[] {
	if (mapPickingStyle !== 'TO') {
		return mapPickingStyleToModes(mapPickingStyle);
	}

	const pickedModes = R.unique(toSetMapPool.map((map) => map.mode));

	// fallback
	if (pickedModes.length === 0) {
		return [...rankedModesShort];
	}

	return pickedModes.sort((a, b) => modesShort.indexOf(a) - modesShort.indexOf(b));
}

export function isOneModeTournamentOf(
	mapPickingStyle: Tables['Tournament']['mapPickingStyle'],
	toSetMapPool: Array<{ mode: ModeShort }>
) {
	return modesIncluded(mapPickingStyle, toSetMapPool).length === 1
		? modesIncluded(mapPickingStyle, toSetMapPool)[0]
		: null;
}

export function tournamentRoundI18nKey(round: PlayedSet['round']) {
	if (round.round === 'grand_finals') return 'bracket.grand_finals';
	if (round.round === 'bracket_reset') {
		return 'bracket.grand_finals.bracket_reset';
	}
	if (round.round === 'finals') return `bracket.${round.type}.finals` as const;

	return `bracket.${round.type}` as const;
}

// xxx: validateCounterPickMapPool
// export type CounterPickValidationStatus =
// 	| 'PICKING'
// 	| 'VALID'
// 	| 'TOO_MUCH_STAGE_REPEAT'
// 	| 'STAGE_REPEAT_IN_SAME_MODE'
// 	| 'INCLUDES_BANNED'
// 	| 'INCLUDES_TIEBREAKER';

// export function validateCounterPickMapPool(
// 	mapPool: MapPool,
// 	isOneModeOnlyTournamentFor: ModeShort | null,
// 	tieBreakerMapPool: TournamentData['ctx']['tieBreakerMapPool']
// ): CounterPickValidationStatus {
// 	const stageCounts = new Map<StageId, number>();
// 	for (const stageId of mapPool.stages) {
// 		if (!stageCounts.has(stageId)) {
// 			stageCounts.set(stageId, 0);
// 		}

// 		if (
// 			stageCounts.get(stageId)! >= TOURNAMENT.COUNTERPICK_MAX_STAGE_REPEAT ||
// 			(isOneModeOnlyTournamentFor && stageCounts.get(stageId)! >= 1)
// 		) {
// 			return 'TOO_MUCH_STAGE_REPEAT';
// 		}

// 		stageCounts.set(stageId, stageCounts.get(stageId)! + 1);
// 	}

// 	if (new MapPool(mapPool.serialized).stageModePairs.length !== mapPool.stageModePairs.length) {
// 		return 'STAGE_REPEAT_IN_SAME_MODE';
// 	}

// 	if (mapPool.stageModePairs.some((pair) => BANNED_MAPS[pair.mode].includes(pair.stageId))) {
// 		return 'INCLUDES_BANNED';
// 	}

// 	if (
// 		mapPool.stageModePairs.some((pair) =>
// 			tieBreakerMapPool.some((stage) => stage.mode === pair.mode && stage.stageId === pair.stageId)
// 		)
// 	) {
// 		return 'INCLUDES_TIEBREAKER';
// 	}

// 	if (
// 		!isOneModeOnlyTournamentFor &&
// 		(mapPool.parsed.SZ.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
// 			mapPool.parsed.TC.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
// 			mapPool.parsed.RM.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE ||
// 			mapPool.parsed.CB.length !== TOURNAMENT.COUNTERPICK_MAPS_PER_MODE)
// 	) {
// 		return 'PICKING';
// 	}

// 	if (
// 		isOneModeOnlyTournamentFor &&
// 		mapPool.parsed[isOneModeOnlyTournamentFor].length !==
// 			TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
// 	) {
// 		return 'PICKING';
// 	}

// 	return 'VALID';
// }

export function tournamentIsRanked({
	isSetAsRanked,
	startTime,
	minMembersPerTeam,
	isTest
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

export function resolveLeagueRoundStartDate(tournament: TournamentClass, roundId: number) {
	if (!tournament.isLeagueDivision) return null;

	const league = Object.values(LEAGUES)
		.flat()
		.find((league) => league.tournamentId === tournament.ctx.parentTournamentId);
	if (!league) return null;

	const bracket = tournament.brackets.find((b) => b.data.round.some((r) => r.id === roundId));

	const round = bracket?.data.round.find((r) => r.id === roundId);
	const onlyRelevantRounds = bracket?.data.round.filter((r) => r.group_id === round?.group_id);

	const roundIdx = onlyRelevantRounds?.findIndex((r) => r.id === roundId);
	if (roundIdx === undefined) return null;

	const week = league.weeks[roundIdx];
	if (!week) return null;

	const date = weekNumberToDate({
		week: week.weekNumber,
		year: week.year
	});

	return date;
}

export function defaultBracketSettings(
	type: Tables['TournamentStage']['type']
): TournamentStageSettings {
	switch (type) {
		case 'single_elimination': {
			return {
				thirdPlaceMatch: true
			};
		}
		case 'double_elimination': {
			return {};
		}
		case 'round_robin': {
			return {
				teamsPerGroup: 4
			};
		}
		case 'swiss': {
			return {
				roundCount: 5,
				groupCount: 1
			};
		}
		default: {
			assertUnreachable(type);
		}
	}
}

export function normalizedTeamCount({
	teamsCount,
	minMembersPerTeam
}: {
	teamsCount: number;
	minMembersPerTeam: number;
}) {
	return teamsCount * minMembersPerTeam;
}

export function getTournamentManager() {
	const storage = new InMemoryDatabase();
	const manager = new BracketsManager(storage);

	return manager;
}
