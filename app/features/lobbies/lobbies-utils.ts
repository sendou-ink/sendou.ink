import { addHours } from "date-fns";
import { CHANNEL_PREFIX } from "~/features/events/events-types";
import { databaseTimestampToDate } from "~/utils/dates";
import { lobbyPage, SENDOU_INK_BASE_URL } from "~/utils/urls";
import { CHAT_ROOM_LIFESPAN_HOURS } from "./lobbies-constants";
import { lobbySearchParams } from "./lobbies-search-params";

/** Topic the lobby's page revalidates on: every change to its participants and sets. */
export const lobbyChannel = (lobbyId: number) =>
	`${CHANNEL_PREFIX.lobby}${lobbyId}`;

/** Link those not participating find a link-only lobby with. */
export const lobbyShareLink = ({
	lobbyId,
	shareKey,
}: {
	lobbyId: number;
	shareKey: string;
}) =>
	`${SENDOU_INK_BASE_URL}${lobbySearchParams.href(lobbyPage(lobbyId), { key: shareKey })}`;

/** When the lobby's chat rooms, its own and its sets' team chats, expire. */
export const lobbyChatRoomExpiresAt = (startsAt: number) =>
	addHours(databaseTimestampToDate(startsAt), CHAT_ROOM_LIFESPAN_HOURS);
