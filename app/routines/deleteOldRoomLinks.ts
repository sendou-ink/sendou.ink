import * as RoomLinkRepository from "../features/chat/RoomLinkRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldRoomLinksRoutine = new Routine({
	name: "DeleteOldRoomLinks",
	func: async () => {
		const { numDeletedRows } = await RoomLinkRepository.deleteOld();
		logger.info(`Deleted ${numDeletedRows} old room links`);
	},
});
