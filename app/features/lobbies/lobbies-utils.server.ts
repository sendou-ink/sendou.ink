import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { tournamentSharedCached } from "~/features/tournament-bracket/core/Tournament.server";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import { errorToastIfFalsy } from "~/utils/remix.server";
import type { LobbyMaps } from "./lobbies-constants";
import { modesOfMaps } from "./lobbies-utils";

/**
 * The lobby's maps, as `LobbyRepository` stores them, from the values of its maps fields: the modes the players'
 * preferences are picked among, or the map pool, a copy of the tournament's or a custom one, with the tournament.
 * Error toast for a tournament without maps or a custom pool that can't be read.
 */
export async function mapsFromForm(values: {
	maps: LobbyMaps;
	mapsTournamentId?: number | null;
	mapPool?: string;
}) {
	const modes = modesOfMaps(values.maps);
	if (modes) return { modes, mapPool: null, mapsTournamentId: null };

	if (values.maps === "TOURNAMENT") {
		errorToastIfFalsy(values.mapsTournamentId, "Pick a tournament");
		const tournament = await tournamentSharedCached(values.mapsTournamentId);
		errorToastIfFalsy(
			!tournament.mapPool.isEmpty(),
			"The tournament has no map pool",
		);

		return withPoolModes({
			mapPool: tournament.mapPool.stageModePairs,
			mapsTournamentId: values.mapsTournamentId,
		});
	}

	const mapPool = values.mapPool ? MapPool.fromUserInput(values.mapPool) : null;
	errorToastIfFalsy(mapPool, "Invalid map pool");

	return withPoolModes({
		mapPool: mapPool.stageModePairs,
		mapsTournamentId: null,
	});
}

function withPoolModes<T extends { mapPool: ModeWithStage[] }>(maps: T) {
	return { ...maps, modes: new MapPool(maps.mapPool).modes };
}
