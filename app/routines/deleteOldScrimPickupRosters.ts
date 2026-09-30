import * as ScrimPickupRosterRepository from "../features/scrims/ScrimPickupRosterRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldScrimPickupRostersRoutine = new Routine({
	name: "DeleteOldScrimPickupRosters",
	func: async () => {
		const { numDeletedRows } = await ScrimPickupRosterRepository.deleteOld();
		logger.info(`Deleted ${numDeletedRows} old scrim pickup rosters`);
	},
});
