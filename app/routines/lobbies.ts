import * as LobbyProgression from "~/features/lobbies/core/LobbyProgression.server";
import * as LobbyRepository from "~/features/lobbies/LobbyRepository.server";
import { notify } from "~/features/notifications/core/notify.server";
import { databaseTimestampNow } from "~/utils/dates";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/**
 * Moves lobbies along on their own schedule: tells the signed up that check-in opened, then advances every
 * lobby that may have something due (starting, ready checks running out, auto-closing). Every lobby action
 * advances its lobby too, this catches what happens with nobody acting.
 */
export const LobbiesRoutine = new Routine({
	name: "Lobbies",
	func: async () => {
		const checkInOpened =
			await LobbyRepository.findAllWithCheckInOpenedUnnotified();
		for (const lobby of checkInOpened) {
			await LobbyRepository.update({
				id: lobby.id,
				checkInNotifiedAt: databaseTimestampNow(),
			});
			await notify({
				userIds: lobby.participants.map((participant) => participant.userId),
				notification: {
					type: "LOBBY_CHECK_IN_OPENED",
					meta: { lobbyId: lobby.id, lobbyName: lobby.name },
				},
			});
		}

		const lobbyIds = await LobbyRepository.findAllUnendedIdsCheckInOpened();
		for (const lobbyId of lobbyIds) {
			await LobbyProgression.advance(lobbyId);
		}

		logger.info(
			`Notified ${checkInOpened.length} lobbies of check-in, advanced ${lobbyIds.length}`,
		);
	},
});
