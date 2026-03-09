import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldTrustRoutine = new Routine({
	name: "DeleteOldTrusts",
	func: async () => {
		const { numDeletedRows } = await SQGroupRepository.deleteOldTrust();
		logger.info(`Deleted ${numDeletedRows} old trusts`);
	},
});
