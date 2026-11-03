import type { UserMapModePreferences } from "~/db/tables-json";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { FEED_ROTATION_MIN_WEEKS } from "../feed-constants";

const HOUR = 3600;
const HOURS_IN_WEEK = 168;

/**
 * Hours of the week (UTC) the user usually plays: ones with matches on at least
 * `FEED_ROTATION_MIN_WEEKS` different weeks.
 */
export function usualPlayHours(matchTimes: number[]): Set<number> {
	const weeksByHour = new Map<number, Set<number>>();
	for (const at of matchTimes) {
		const hour = hourOfWeek(at);
		const weeks = weeksByHour.get(hour) ?? new Set<number>();
		weeks.add(Math.floor(at / (HOURS_IN_WEEK * HOUR)));
		weeksByHour.set(hour, weeks);
	}

	const result = new Set<number>();
	for (const [hour, weeks] of weeksByHour) {
		if (weeks.size >= FEED_ROTATION_MIN_WEEKS) result.add(hour);
	}

	return result;
}

/** Whether any hour of the rotation is a usual play hour, give or take an hour (daylight saving, start time jitter). */
export function isDuringUsualHours(
	rotation: { startsAt: number; endsAt: number },
	usualHours: Set<number>,
) {
	for (let at = rotation.startsAt; at < rotation.endsAt; at += HOUR) {
		const hour = hourOfWeek(at);
		for (const offset of [-1, 0, 1]) {
			if (usualHours.has((hour + offset + HOURS_IN_WEEK) % HOURS_IN_WEEK)) {
				return true;
			}
		}
	}

	return false;
}

/** The rotation's stages that are in the user's map pool for its mode, none if the mode is avoided. */
export function matchingStageIds(
	rotation: { mode: ModeShort; stageIds: readonly StageId[] },
	preferences: UserMapModePreferences | null,
): StageId[] {
	if (!preferences) return [];

	const isAvoided = preferences.modes.some(
		(mode) => mode.mode === rotation.mode && mode.preference === "AVOID",
	);
	if (isAvoided) return [];

	const pool =
		preferences.pool.find((entry) => entry.mode === rotation.mode)?.stages ??
		[];

	return rotation.stageIds.filter((stageId) => pool.includes(stageId));
}

function hourOfWeek(at: number) {
	return Math.floor(at / HOUR) % HOURS_IN_WEEK;
}
