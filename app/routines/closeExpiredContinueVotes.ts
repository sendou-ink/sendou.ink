import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const CloseExpiredContinueVotesRoutine = new Routine({
	name: "CloseExpiredContinueVotes",
	func: async () => {
		const { numAffectedGroups, chatRoomIdsToRevalidate } =
			await SQGroupRepository.closeExpiredContinueVotes();

		for (const roomId of new Set(chatRoomIdsToRevalidate)) {
			ChatSystemMessage.send({
				channel: EventBus.chatRoomChannel(roomId),
				revalidateOnly: true,
			});
		}

		logger.info(`Closed continue votes for ${numAffectedGroups} group(s)`);
	},
});
