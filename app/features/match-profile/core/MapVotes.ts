/**
 * Votes of a player's match profile for the maps of their matches: SendouQ and lobby map lists are picked from
 * the players' map pools, and a match shows who voted for the map being played.
 */
import type { UserMapModePreferences } from "~/db/tables-json";
import type { ModeWithStage } from "~/modules/in-game-lists/types";

/** The map is in the player's pool, of a mode they don't avoid. */
export function votesFor(
	preferences: UserMapModePreferences,
	map: ModeWithStage,
): boolean {
	const isAvoidedMode = preferences.modes.some(
		(mode) => mode.mode === map.mode && mode.preference === "AVOID",
	);
	if (isAvoidedMode) return false;

	return preferences.pool.some(
		(candidate) =>
			candidate.mode === map.mode && candidate.stages.includes(map.stageId),
	);
}
