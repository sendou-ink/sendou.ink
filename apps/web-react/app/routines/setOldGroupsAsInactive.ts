import { logger } from "@sendou/utils/logger";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { Routine } from "./routine.server";

export const SetOldGroupsAsInactiveRoutine = new Routine({
	name: "SetOldGroupsAsInactive",
	func: async () => {
		const { numUpdatedRows } = await SQGroupRepository.setOldGroupsAsInactive();
		await refreshSendouQInstance();
		logger.info(`Set ${numUpdatedRows} as inactive`);
	},
});
