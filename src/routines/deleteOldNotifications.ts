import * as NotificationRepository from "../features/notifications/NotificationRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const DeleteOldNotificationsRoutine = new Routine({
	name: "DeleteOldNotifications",
	func: async () => {
		const { numDeletedRows } = await NotificationRepository.deleteOld();
		logger.info(`Deleted ${numDeletedRows} old notifications`);
	},
});
