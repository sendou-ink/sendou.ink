import * as QRepository from "~/features/sendouq/QRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldTrustRoutine = new Routine({
	name: "DeleteOldTrusts",
	func: async () => {
		const { numDeletedRows } = await QRepository.deleteOldTrust();
		logger.info(`Deleted ${numDeletedRows} old trusts`);
	},
});
