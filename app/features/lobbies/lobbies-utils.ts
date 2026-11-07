import { addHours } from "date-fns";
import type * as v from "valibot";
import * as Visibility from "~/features/associations/core/Visibility";
import { CHANNEL_PREFIX } from "~/features/events/events-types";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, ModeWithStage } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import { assertUnreachable } from "~/utils/types";
import { lobbyPage, newLobbyPage, SENDOU_INK_BASE_URL } from "~/utils/urls";
import { CHAT_ROOM_LIFESPAN_HOURS, type LobbyMaps } from "./lobbies-constants";
import type { editLobbySchema } from "./lobbies-schemas";
import {
	lobbySearchParams,
	newLobbySearchParams,
} from "./lobbies-search-params";

/** Topic the lobby's page revalidates on: every change to its participants and sets. */
export const lobbyChannel = (lobbyId: number) =>
	`${CHANNEL_PREFIX.lobby}${lobbyId}`;

/** Invite link of the lobby, showing it to those not participating whatever its visibility. */
export const lobbyShareLink = ({
	lobbyId,
	shareKey,
}: {
	lobbyId: number;
	shareKey: string;
}) =>
	`${SENDOU_INK_BASE_URL}${lobbySearchParams.href(lobbyPage(lobbyId), { key: shareKey })}`;

/** The new lobby page with the lobby's settings filled in, saving them to it. */
export const editLobbyPage = (lobbyId: number) =>
	newLobbySearchParams.href(newLobbyPage(), { lobbyId });

/** When the lobby's chat rooms, its own and its sets' team chats, expire. */
export const lobbyChatRoomExpiresAt = (startsAt: number) =>
	addHours(databaseTimestampToDate(startsAt), CHAT_ROOM_LIFESPAN_HOURS);

/** The lobby's visibility, as `LobbyRepository.insert` takes it, from the values of its visibility fields. */
export function visibilityFromForm(
	values: Pick<
		v.InferOutput<typeof editLobbySchema>,
		"baseVisibility" | "notFoundVisibility"
	>,
) {
	if (values.baseVisibility === "LINK_ONLY") return "LINK_ONLY" as const;

	return Visibility.fromForm({
		baseVisibility: values.baseVisibility,
		notFoundVisibility: values.notFoundVisibility,
	});
}

/** Modes the players' preferences are picked among for the option of the maps select, `null` for a map pool. */
export function modesOfMaps(maps: LobbyMaps): ModeShort[] | null {
	switch (maps) {
		case "RANKED":
			return [...rankedModesShort];
		case "SZ":
			return ["SZ"];
		case "ALL":
			return [...modesShort];
		case "TOURNAMENT":
		case "CUSTOM":
			return null;
		default:
			assertUnreachable(maps);
	}
}

/** Values of the lobby's maps fields: its option of the maps select and the tournament or custom map pool it has. */
export function mapsFormValues(lobby: {
	modes: ModeShort[];
	mapPool: ModeWithStage[] | null;
	mapsTournamentId: number | null;
}) {
	const maps = ((): LobbyMaps => {
		if (lobby.mapsTournamentId) return "TOURNAMENT";
		if (lobby.mapPool) return "CUSTOM";
		if (lobby.modes.includes("TW")) return "ALL";
		if (lobby.modes.length === 1 && lobby.modes[0] === "SZ") return "SZ";

		return "RANKED";
	})();

	return {
		maps,
		mapsTournamentId: lobby.mapsTournamentId,
		mapPool:
			maps === "CUSTOM" && lobby.mapPool
				? new MapPool(lobby.mapPool).serialized
				: "",
	};
}
