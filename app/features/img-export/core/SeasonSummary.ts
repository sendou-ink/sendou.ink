import * as R from "remeda";
import * as Seasons from "~/features/mmr/core/Seasons";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { Role } from "~/modules/permissions/types";

const BEST_STAGE_MIN_MAPS_NEEDED = 10;
const UNTIERED_TOURNAMENT_TIER = 10;
const TOP_WEAPONS_COUNT = 3;
const FIELD_STRENGTH_BASELINE_SP = 1200;
const FIELD_STRENGTH_SP_PER_POINT = 800;

export interface SetScore {
	ownScore: number;
	opponentScore: number;
}

/** Longest run of consecutive set wins; `sets` must be in chronological order. */
export function longestWinStreak(sets: SetScore[]): number {
	let longest = 0;
	let current = 0;

	for (const set of sets) {
		if (set.ownScore > set.opponentScore) {
			current += 1;
			longest = Math.max(longest, current);
		} else {
			current = 0;
		}
	}

	return longest;
}

/** Win record in sets decided by one map (4-3 in SendouQ, 2-1/3-2 in tournaments). */
export function clutchRecord(sets: SetScore[]): { won: number; total: number } {
	const decidingMapSets = sets.filter(
		(set) => Math.abs(set.ownScore - set.opponentScore) === 1,
	);

	return {
		won: decidingMapSets.filter((set) => set.ownScore > set.opponentScore)
			.length,
		total: decidingMapSets.length,
	};
}

/** Best winrate stage across modes; stages under the maps-played threshold are excluded so a lucky 2-0 can't win. */
export function bestStage(
	stages: Partial<
		Record<
			StageId,
			Partial<Record<ModeShort, { wins: number; losses: number }>>
		>
	>,
): { stageId: StageId; winratePercentage: number } | undefined {
	let best: { stageId: StageId; winratePercentage: number } | undefined;

	for (const [stageId, modes] of Object.entries(stages)) {
		let wins = 0;
		let losses = 0;
		for (const record of Object.values(modes)) {
			wins += record.wins;
			losses += record.losses;
		}

		const mapsPlayed = wins + losses;
		if (mapsPlayed < BEST_STAGE_MIN_MAPS_NEEDED) continue;

		const winratePercentage = (wins / mapsPlayed) * 100;
		if (!best || winratePercentage > best.winratePercentage) {
			best = { stageId: Number(stageId) as StageId, winratePercentage };
		}
	}

	return best;
}

/** Stage with the most maps played across modes, higher winrate breaking ties; `undefined` when no maps were played. */
export function mostPlayedStage(
	stages: Partial<
		Record<
			StageId,
			Partial<Record<ModeShort, { wins: number; losses: number }>>
		>
	>,
): { stageId: StageId; winratePercentage: number } | undefined {
	const played = Object.entries(stages).flatMap(([stageId, modes]) => {
		const wins = R.sumBy(Object.values(modes), (record) => record.wins);
		const losses = R.sumBy(Object.values(modes), (record) => record.losses);
		const mapsPlayed = wins + losses;
		if (mapsPlayed === 0) return [];

		return [
			{
				stageId: Number(stageId) as StageId,
				mapsPlayed,
				winratePercentage: (wins / mapsPlayed) * 100,
			},
		];
	});

	const top = R.firstBy(
		played,
		[(stage) => stage.mapsPlayed, "desc"],
		[(stage) => stage.winratePercentage, "desc"],
	);
	if (!top) return undefined;

	return { stageId: top.stageId, winratePercentage: top.winratePercentage };
}

/** Mode with the most maps played across stages, with its share of all maps played; `null` when no maps were played. */
export function topModeUsage(
	stages: Partial<
		Record<
			StageId,
			Partial<Record<ModeShort, { wins: number; losses: number }>>
		>
	>,
): { mode: ModeShort; usagePercentage: number } | null {
	const mapsPlayedByMode = new Map<ModeShort, number>();

	for (const modes of Object.values(stages)) {
		for (const [mode, record] of Object.entries(modes) as Array<
			[ModeShort, { wins: number; losses: number }]
		>) {
			mapsPlayedByMode.set(
				mode,
				(mapsPlayedByMode.get(mode) ?? 0) + record.wins + record.losses,
			);
		}
	}

	const totalMapsPlayed = R.sum([...mapsPlayedByMode.values()]);
	const top = R.firstBy([...mapsPlayedByMode], [([, count]) => count, "desc"]);
	if (!top || totalMapsPlayed === 0) return null;

	return {
		mode: top[0],
		usagePercentage: (top[1] / totalMapsPlayed) * 100,
	};
}

export interface TournamentRun {
	/** 1 = X (best) … 9 = C. Null (no calculated tier) ranks below every tiered tournament. */
	tier: number | null;
	placement: number;
	teamsCount: number;
	/** Average end of season SP of the top 8 placers; null when none had a calculated skill. */
	topEightAvgSp: number | null;
}

/** Ranks a season's tournament runs: tier dominates, then placement relative to field size and field strength. */
export function tournamentRunScore(run: TournamentRun): number {
	const tier = run.tier ?? UNTIERED_TOURNAMENT_TIER;

	return (
		(10 - tier) * 3 +
		Math.log2(run.teamsCount / run.placement) +
		fieldStrengthScore(run.topEightAvgSp)
	);
}

/** The best tournament run by {@link tournamentRunScore}. */
export function bestTournamentRun<T extends TournamentRun>(
	runs: T[],
): T | undefined {
	return R.firstBy(runs, [tournamentRunScore, "desc"]);
}

/** Most used weapons with their share of all reported weapon occurrences, most used first. */
export function topWeaponUsages(
	reportedWeapons: Array<{ weaponSplId: MainWeaponId; count: number }>,
): Array<{ weaponSplId: MainWeaponId; usagePercentage: number }> {
	const totalCount = R.sumBy(reportedWeapons, (weapon) => weapon.count);
	if (totalCount === 0) return [];

	return reportedWeapons
		.toSorted((a, b) => b.count - a.count)
		.slice(0, TOP_WEAPONS_COUNT)
		.map((weapon) => ({
			weaponSplId: weapon.weaponSplId,
			usagePercentage: (weapon.count / totalCount) * 100,
		}));
}

/** Whether the season has ended. */
export function isSeasonFinished(season: number, date = new Date()) {
	return Seasons.allFinished(date).some((nth) => nth === season);
}

/** Exportable without the supporter perk: only the latest finished season, and only while no season is in progress. */
export function isSeasonExportableByAll(season: number, date = new Date()) {
	return (
		Seasons.current(date) === null && Seasons.allFinished(date)[0] === season
	);
}

/**
 * Only the profile owner can export, with a non-approximate skill for a finished season. Supporters
 * can export any finished season, others only per {@link isSeasonExportableByAll}.
 */
export function canExportSeasonSummary({
	loggedInUser,
	profileUserId,
	season,
	seasonsParticipatedIn,
	hasCalculatedSkill,
	date = new Date(),
}: {
	loggedInUser?: { id: number; roles: Role[] };
	profileUserId: number;
	season: number;
	seasonsParticipatedIn: number[];
	hasCalculatedSkill: boolean;
	date?: Date;
}): boolean {
	if (!loggedInUser || loggedInUser.id !== profileUserId) return false;
	if (!seasonsParticipatedIn.includes(season)) return false;
	if (!hasCalculatedSkill) return false;
	if (!isSeasonFinished(season, date)) return false;
	if (loggedInUser.roles.includes("SUPPORTER")) return true;

	return isSeasonExportableByAll(season, date);
}

function fieldStrengthScore(topEightAvgSp: number | null) {
	if (topEightAvgSp === null) return 0;

	return Math.max(
		0,
		(topEightAvgSp - FIELD_STRENGTH_BASELINE_SP) / FIELD_STRENGTH_SP_PER_POINT,
	);
}
