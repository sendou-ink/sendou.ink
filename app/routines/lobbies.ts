import * as LobbyProgression from "~/features/lobbies/core/LobbyProgression.server";
import * as LobbyRepository from "~/features/lobbies/LobbyRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/**
 * Moves lobbies along on their own schedule: advances every lobby that may have something due (check-in opening,
 * starting, ready checks running out, auto-closing). Every lobby action advances its lobby too, this catches
 * what happens with nobody acting.
 */
export const LobbiesRoutine = new Routine({
	name: "Lobbies",
	func: async () => {
		const lobbyIds = await LobbyRepository.findAllUnendedIdsNearStart();
		for (const lobbyId of lobbyIds) {
			await LobbyProgression.advance(lobbyId);
		}

		logger.info(`Advanced ${lobbyIds.length} lobbies`);
	},
});
