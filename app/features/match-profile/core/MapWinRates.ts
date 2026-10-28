/**
 * A player's SendouQ win rates per mode and stage, shown next to the map pool preferences of their
 * match profile so they can pick maps they do well on. Records are summed from the per-stage map
 * results of recent seasons, small samples are flagged as tentative and each win rate is drawn as a
 * bar growing from an even 50%.
 */

import type { ModeShort, StageId } from "~/modules/in-game-lists/types";

/** Below this many maps a win rate is shown as tentative. */
const LOW_SAMPLE_MAPS_COUNT = 5;
/** How much the distance from an even win rate is stretched on the bar, so typical differences stay visible. */
const BAR_STRETCH = 2;

/** Maps won and lost by a player on one stage of a mode. */
export type MapResult = {
	mode: ModeShort;
	stageId: StageId;
	wins: number;
	losses: number;
};

/** A record of maps won and lost. */
export type WinLoss = Pick<MapResult, "wins" | "losses">;

/** How stages are ordered in the picker: as listed, best win rate first or worst first. */
export type SortOrder = "DEFAULT" | "BEST" | "WORST";

/** Sums the records of a mode, or of one stage in it when `stageId` is given. */
export function record(
	results: MapResult[],
	{ mode, stageId }: { mode: ModeShort; stageId?: StageId },
): WinLoss {
	const total = { wins: 0, losses: 0 };

	for (const result of results) {
		if (result.mode !== mode) continue;
		if (stageId !== undefined && result.stageId !== stageId) continue;

		total.wins += result.wins;
		total.losses += result.losses;
	}

	return total;
}

/** Share of maps won between 0 and 1, `null` when none were played. */
export function rate({ wins, losses }: WinLoss): number | null {
	const total = wins + losses;
	if (total === 0) return null;

	return wins / total;
}

/** Whether too few maps were played for the win rate to mean much. */
export function isLowSample({ wins, losses }: WinLoss) {
	return wins + losses < LOW_SAMPLE_MAPS_COUNT;
}

/**
 * Orders stages of a mode by win rate. `DEFAULT` keeps the given order; otherwise ties go to the stage
 * with more maps played and stages without maps come last, in their given order.
 */
export function sortStages({
	stageIds,
	results,
	mode,
	order,
}: {
	stageIds: readonly StageId[];
	results: MapResult[];
	mode: ModeShort;
	order: SortOrder;
}): StageId[] {
	if (order === "DEFAULT") return [...stageIds];

	const direction = order === "BEST" ? -1 : 1;
	const withRecords = stageIds.map((stageId) => {
		const stageRecord = record(results, { mode, stageId });
		return {
			stageId,
			rate: rate(stageRecord),
			total: stageRecord.wins + stageRecord.losses,
		};
	});

	return withRecords
		.toSorted((a, b) => {
			if (a.rate === null || b.rate === null) {
				return Number(a.rate === null) - Number(b.rate === null);
			}
			if (a.rate !== b.rate) return direction * (a.rate - b.rate);

			return b.total - a.total;
		})
		.map(({ stageId }) => stageId);
}

/**
 * Where the bar of a win rate goes on a track centered on 50%, both in percent of the track. It grows right
 * of the center for winning records and left for losing ones; 75% and 25% (or beyond) fill their half.
 */
export function barSegment(winRate: number) {
	const widthPercent = Math.min(
		50,
		Math.abs(winRate - 0.5) * 100 * BAR_STRETCH,
	);

	return {
		startPercent: winRate >= 0.5 ? 50 : 50 - widthPercent,
		widthPercent,
	};
}
