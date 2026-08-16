import * as ExternalStreamRepository from "../features/admin/ExternalStreamRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldExternalStreamsRoutine = new Routine({
	name: "DeleteOldExternalStreams",
	func: async () => {
		const { numDeletedRows } = await ExternalStreamRepository.deleteOld();
		logger.info(`Deleted ${numDeletedRows} old external streams`);
	},
});
