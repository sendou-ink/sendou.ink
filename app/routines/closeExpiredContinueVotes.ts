import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const CloseExpiredContinueVotesRoutine = new Routine({
	name: "CloseExpiredContinueVotes",
	func: async () => {
		const { numAffectedGroups, chatCodesToRevalidate } =
			await SQGroupRepository.closeExpiredContinueVotes();

		for (const room of new Set(chatCodesToRevalidate)) {
			ChatSystemMessage.send({ room, revalidateOnly: true });
		}

		logger.info(`Closed continue votes for ${numAffectedGroups} group(s)`);
	},
});
