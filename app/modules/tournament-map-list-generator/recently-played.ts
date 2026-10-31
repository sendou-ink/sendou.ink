import * as R from "remeda";
import type { ModeWithStage } from "../in-game-lists/types";
import { RECENTLY_PLAYED_MAPS_WINDOW } from "./constants";
import type { TournamentMaplistInput } from "./types";

/**
 * How many maps ago a map was last played, the team that played it more recently counts. Maps neither
 * team played within the window count as {@link RECENTLY_PLAYED_MAPS_WINDOW}, the longest ago possible.
 *
 * @example
 * mapsAgo({ mode: "SZ", stageId: 2 }, [[sz1, sz2], [sz2]]); // 0
 * mapsAgo({ mode: "SZ", stageId: 3 }, [[sz1, sz2], [sz2]]); // RECENTLY_PLAYED_MAPS_WINDOW
 */
export function mapsAgo(
	map: ModeWithStage,
	recentlyPlayedMaps: TournamentMaplistInput["recentlyPlayedMaps"],
) {
	let result = RECENTLY_PLAYED_MAPS_WINDOW;

	for (const teamMaps of recentlyPlayedMaps ?? []) {
		const index = teamMaps.findIndex(
			(recent) => recent.stageId === map.stageId && recent.mode === map.mode,
		);
		if (index !== -1) result = Math.min(result, index);
	}

	return result;
}

/** The map played longest ago, ties going to the earliest in the given order. `undefined` for no maps. */
export function leastRecentlyPlayed<T extends ModeWithStage>(
	maps: T[],
	recentlyPlayedMaps: TournamentMaplistInput["recentlyPlayedMaps"],
): T | undefined {
	return R.firstBy(maps, [(map) => mapsAgo(map, recentlyPlayedMaps), "desc"]);
}
