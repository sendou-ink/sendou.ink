import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { tournamentSharedCached } from "~/features/tournament-bracket/core/Tournament.server";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { errorToastIfFalsy } from "~/utils/remix.server";
import * as LobbySet from "./core/LobbySet";
import * as LobbyState from "./core/LobbyState";
import type * as LobbyMatchRepository from "./LobbyMatchRepository.server";
import type * as LobbyRepository from "./LobbyRepository.server";
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

/**
 * The lobby's status and what the viewer may do in it right now, the one place the lobby page and its action decide
 * the viewer's gates from. `side` is the viewer's side of the set being played while in the room.
 */
export function lobbyViewerState({
	lobby,
	sets,
	viewer,
	now: nowDate = new Date(),
	hasFriendCode,
}: {
	lobby: LobbyRepository.LobbyById;
	sets: LobbyMatchRepository.LobbySetWithGames[];
	viewer: LobbyRepository.LobbyById["participants"][number] | null;
	now?: Date;
	hasFriendCode: boolean;
}) {
	const now = dateToDatabaseTimestamp(nowDate);
	const latestSet = sets.at(-1) ?? null;
	const isPlaying = latestSet !== null && !LobbySet.isFinished(latestSet);
	const { status, isCheckInOpen } = LobbyState.statusAndCheckIn({
		lobby,
		participants: lobby.participants,
		isPlaying,
		now,
	});

	const side =
		latestSet && viewer?.status === "IN_ROOM"
			? LobbySet.sideOf(latestSet, viewer.id)
			: null;
	const isPlayingUnfinishedSet = isPlaying && side !== null;

	return {
		status,
		isCheckInOpen,
		side,
		isPlayingUnfinishedSet,
		actions: LobbyState.viewerActions({
			status,
			viewer,
			isPlayingUnfinishedSet,
			hasFriendCode,
			isKicked: lobby.isViewerKicked,
			application: lobby.viewerApplication,
			isCheckInOpen,
			activeCount: LobbyState.activeCount(lobby.participants),
			roomSize: lobby.roomSize,
			now,
			startsAt: lobby.startsAt,
		}),
	};
}

function withPoolModes<T extends { mapPool: ModeWithStage[] }>(maps: T) {
	return { ...maps, modes: new MapPool(maps.mapPool).modes };
}
