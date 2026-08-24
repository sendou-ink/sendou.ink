import { sub } from "date-fns";
import * as ChatRepository from "../features/chat/ChatRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

const CLOSE_AFTER_EXPIRY = { months: 1 };

export const CloseExpiredChatRoomsRoutine = new Routine({
	name: "CloseExpiredChatRooms",
	func: async () => {
		const deletedCount = await ChatRepository.deleteOrphanedRooms();

		const closedCount = await ChatRepository.closeExpiredRooms(
			sub(new Date(), CLOSE_AFTER_EXPIRY),
		);

		logger.info(
			`Closed ${closedCount} expired chat rooms and deleted ${deletedCount} orphaned ones`,
		);
	},
});
