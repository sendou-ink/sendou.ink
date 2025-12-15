import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const SetOldGroupsAsInactiveRoutine = new Routine({
	name: "SetOldGroupsAsInactive",
	func: async () => {
		const { numUpdatedRows } = await SQGroupRepository.setOldGroupsAsInactive();
		logger.info(`Set ${numUpdatedRows} as inactive`);
	},
});
