import { CHANNEL_PREFIX } from "~/features/events/events-types";
import { lobbyPage, SENDOU_INK_BASE_URL } from "~/utils/urls";
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
