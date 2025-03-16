import * as QRepository from "~/features/sendouq/QRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const SetOldGroupsAsInactiveRoutine = new Routine({
	name: "SetOldGroupsAsInactive",
	func: async () => {
		const { numUpdatedRows } = await QRepository.setOldGroupsAsInactive();
		logger.info(`Set ${numUpdatedRows} as inactive`);
	},
});
