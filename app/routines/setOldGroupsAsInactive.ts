import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { SENDOUQ_LOOKING_CHANNEL } from "~/features/sendouq/q-constants";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const SetOldGroupsAsInactiveRoutine = new Routine({
	name: "SetOldGroupsAsInactive",
	func: async () => {
		const { numUpdatedRows } = await SQGroupRepository.setOldGroupsAsInactive();
		await refreshSendouQInstance();
		if (numUpdatedRows > 0) {
			ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });
		}
		logger.info(`Set ${numUpdatedRows} as inactive`);
	},
});
