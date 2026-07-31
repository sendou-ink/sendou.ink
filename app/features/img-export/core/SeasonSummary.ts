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

/**
 * Length of the longest run of consecutive set wins in the given
 * chronologically ordered list of sets.
 */
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

/**
 * Win record in sets that went to a deciding map, i.e. the score margin was
 * exactly one (4-3 in SendouQ, 2-1/3-2 in tournaments).
 */
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

/**
 * Stage with the best winrate aggregated across modes. Stages with less than
 * a minimum threshold of maps played are excluded so a lucky 2-0 stage can't
 * win. Returns undefined when no stage passes the threshold.
 */
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

export interface TournamentRun {
	/** Tournament tier, 1 = X (best) … 9 = C. Null when the tournament has no calculated tier (treated as below every tiered tournament). */
	tier: number | null;
	placement: number;
	teamsCount: number;
	/** Average end of season SP of the players who placed in the tournament's top 8. Null when none of them had a calculated skill. */
	topEightAvgSp: number | null;
}

/**
 * Composite score for ranking a user's tournament runs of a season. The
 * tournament's tier dominates; within a tier both the user's placement quality
 * relative to the field size and the strength of that field contribute.
 */
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

/**
 * The user's most used weapons with their share of all reported weapon
 * occurrences, most used first.
 */
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

/** Whether the season has ended, a prerequisite for exporting its summary image. */
export function isSeasonFinished(season: number, date = new Date()) {
	return Seasons.allFinished(date).some((nth) => nth === season);
}

/**
 * Whether a season's summary image is exportable without the supporter perk:
 * only the latest finished season is, and only while no season is in progress.
 */
export function isSeasonExportableByAll(season: number, date = new Date()) {
	return (
		Seasons.current(date) === null && Seasons.allFinished(date)[0] === season
	);
}

/**
 * Whether the logged in user can export the season summary image from the
 * given profile. Only the profile owner can export, they must have
 * participated in the season and have a calculated (non-approximate) skill
 * for it. An ongoing season is never exportable. Supporters can export any of
 * their finished seasons, others only per {@link isSeasonExportableByAll}.
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
