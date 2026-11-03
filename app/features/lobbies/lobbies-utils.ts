import { addHours } from "date-fns";
import type * as v from "valibot";
import * as Visibility from "~/features/associations/core/Visibility";
import { CHANNEL_PREFIX } from "~/features/events/events-types";
import { databaseTimestampToDate } from "~/utils/dates";
import { lobbyPage, SENDOU_INK_BASE_URL } from "~/utils/urls";
import { CHAT_ROOM_LIFESPAN_HOURS } from "./lobbies-constants";
import type { lobbyVisibilitySchema } from "./lobbies-schemas";
import { lobbySearchParams } from "./lobbies-search-params";

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

/** When the lobby's chat rooms, its own and its sets' team chats, expire. */
export const lobbyChatRoomExpiresAt = (startsAt: number) =>
	addHours(databaseTimestampToDate(startsAt), CHAT_ROOM_LIFESPAN_HOURS);

/** The lobby's visibility, as `LobbyRepository.insert` takes it, from the values of its visibility fields. */
export function visibilityFromForm(
	values: Pick<
		v.InferOutput<typeof lobbyVisibilitySchema>,
		"baseVisibility" | "notFoundVisibility"
	>,
) {
	if (values.baseVisibility === "LINK_ONLY") return "LINK_ONLY" as const;

	return Visibility.fromForm({
		baseVisibility: values.baseVisibility,
		notFoundVisibility: values.notFoundVisibility,
	});
}
