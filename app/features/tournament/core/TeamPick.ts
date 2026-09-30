import type { TeamPickSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { assertUnreachable } from "~/utils/types";

const DEFAULT_COUNT_BY_MODE_COUNT = [6, 4, 3] as const;
const DEFAULT_COUNT_MANY_MODES = 2;

/** At least this many stage-slots per pick so a tight pool never forces every stage to be used the maximum times. */
const STAGE_SLOTS_PER_PICK = 1.5;
const MIN_STAGE_REPEAT_CAP = 2;

export type TeamPoolValidationStatus =
	| "PICKING"
	| "VALID"
	| "TOO_MUCH_STAGE_REPEAT"
	| "STAGE_REPEAT_IN_SAME_MODE"
	| "NOT_IN_POOL";

/**
 * How many maps a team picks per mode by default: 6 for one mode, 4 for two, 3 for three and 2 for more.
 *
 * @example
 * defaultCount(1); // 6
 * defaultCount(4); // 2
 */
export function defaultCount(modeCount: number) {
	return DEFAULT_COUNT_BY_MODE_COUNT[modeCount - 1] ?? DEFAULT_COUNT_MANY_MODES;
}

/** Team pick settings for the given modes with the default count for each and the SendouQ pool. */
export function defaultSettings(modes: ModeShort[]): TeamPickSettings {
	const count = defaultCount(modes.length);

	return {
		modes: sortModes(modes).map((mode) => ({ mode, count })),
		pool: "SENDOUQ",
	};
}

/** Modes in the fixed in-game order, duplicates dropped. */
export function sortModes(modes: ModeShort[]) {
	return modesShort.filter((mode) => modes.includes(mode));
}

/** Modes teams pick maps for. */
export function pickedModes(teamPick: TeamPickSettings) {
	return teamPick.modes.map((m) => m.mode);
}

/**
 * Pool the teams pick their maps from, limited to the picked modes. `customPool` is the
 * organizer's pool, only read for the "CUSTOM" pool option.
 */
export function effectivePool(
	teamPick: TeamPickSettings,
	customPool: Array<{ mode: ModeShort; stageId: StageId }>,
): MapPool {
	const modesIncluded = pickedModes(teamPick);

	const basePool = () => {
		switch (teamPick.pool) {
			case "SENDOUQ":
				return SENDOUQ_MAP_POOL;
			case "ALL":
				return MapPool.ALL;
			case "CUSTOM":
				return new MapPool(customPool);
			default:
				assertUnreachable(teamPick.pool);
		}
	};

	return new MapPool(
		basePool().stageModePairs.filter((pair) =>
			modesIncluded.includes(pair.mode),
		),
	);
}

/** Most maps a team can pick in a mode, one less than the pool has so the random neutral map always has a stage to draw from. */
export function maxCount(pool: MapPool, mode: ModeShort) {
	return Math.max(1, pool.countMapsByMode(mode) - 1);
}

/**
 * Picked modes whose pool has fewer stages than the count plus one, with how many stages they need.
 * Empty for a pool the teams can pick from.
 */
export function poolShortfalls(teamPick: TeamPickSettings, pool: MapPool) {
	return teamPick.modes.flatMap(({ mode, count }) => {
		const required = count + 1;
		const has = pool.countMapsByMode(mode);

		return has < required ? [{ mode, required, has }] : [];
	});
}

/**
 * In how many modes one stage may appear in a team's picks. Grows from 2 as the pool gets tight
 * relative to the picks and turns off (equals the mode count) when it can't be satisfied.
 *
 * @example
 * // 4 modes × 2 picks from the SendouQ pool (25 distinct stages)
 * stageRepeatCap({ teamPick, pool }); // 2
 * // 4 modes × 4 picks from 8 stages
 * stageRepeatCap({ teamPick, pool }); // 3
 */
export function stageRepeatCap({
	teamPick,
	pool,
}: {
	teamPick: TeamPickSettings;
	pool: MapPool;
}) {
	const totalPicks = teamPick.modes.reduce((acc, cur) => acc + cur.count, 0);
	const distinctStages = new Set(pool.stages).size;
	const modeCount = teamPick.modes.length;

	if (distinctStages === 0) return modeCount;

	const cap = Math.ceil((STAGE_SLOTS_PER_PICK * totalPicks) / distinctStages);

	return Math.min(Math.max(cap, MIN_STAGE_REPEAT_CAP), modeCount);
}

/**
 * Validates a team's picks against the tournament's team pick settings and effective pool.
 * Statuses with an explanation come before "PICKING" so a mistake shows while still picking.
 */
export function validateTeamPool({
	mapPool,
	teamPick,
	pool,
}: {
	mapPool: MapPool;
	teamPick: TeamPickSettings;
	pool: MapPool;
}): TeamPoolValidationStatus {
	if (
		new MapPool(mapPool.serialized).stageModePairs.length !==
		mapPool.stageModePairs.length
	) {
		return "STAGE_REPEAT_IN_SAME_MODE";
	}

	if (mapPool.stageModePairs.some((pair) => !pool.has(pair))) {
		return "NOT_IN_POOL";
	}

	const cap = stageRepeatCap({ teamPick, pool });
	const stageCounts = new Map<StageId, number>();
	for (const stageId of mapPool.stages) {
		stageCounts.set(stageId, (stageCounts.get(stageId) ?? 0) + 1);
	}
	if (Array.from(stageCounts.values()).some((count) => count > cap)) {
		return "TOO_MUCH_STAGE_REPEAT";
	}

	const everyModeComplete = teamPick.modes.every(
		({ mode, count }) => mapPool.countMapsByMode(mode) === count,
	);
	if (!everyModeComplete) return "PICKING";

	return "VALID";
}
