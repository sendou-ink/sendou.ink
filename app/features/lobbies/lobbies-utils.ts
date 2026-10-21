import { CHANNEL_PREFIX } from "~/features/events/events-types";

/** Topic the lobby's page revalidates on: every change to its participants and sets. */
export const lobbyChannel = (lobbyId: number) =>
	`${CHANNEL_PREFIX.lobby}${lobbyId}`;
