import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "../features/admin/core/dev-controls";
import * as AvailabilityRepository from "../features/availability/AvailabilityRepository.server";
import * as Availability from "../features/availability/core/Availability";
import { notify } from "../features/notifications/core/notify.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

/** Reminds users whose teammates reported the week that just started while they have not. Mondays only, so at most one reminder per week. */
export const NotifyScheduleTeamReminderRoutine = new Routine({
	name: "NotifyScheduleTeamReminder",
	func: async () => {
		const now = new Date();

		// runs whatever the day is when triggered by hand in development
		if (
			!Availability.isFirstDayOfWeek(now, "UTC") &&
			!DANGEROUS_CAN_ACCESS_DEV_CONTROLS
		) {
			return;
		}

		const userIds = await AvailabilityRepository.findWeekReminderUserIds(
			Availability.weekStartsAt(now, "UTC"),
		);

		if (userIds.length === 0) return;

		logger.info(`Reminding ${userIds.length} users about their schedule`);

		await notify({
			notification: { type: "SCHEDULE_TEAM_REMINDER" },
			userIds,
		});
	},
});
