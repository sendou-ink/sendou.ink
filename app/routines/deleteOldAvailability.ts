import { subDays, subMonths } from "date-fns";
import * as AvailabilityRepository from "../features/availability/AvailabilityRepository.server";
import { AVAILABILITY } from "../features/availability/availability-constants";
import { dateToDatabaseTimestamp } from "../utils/dates";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

const WEEK_DAYS = 7;

export const DeleteOldAvailabilityRoutine = new Routine({
	name: "DeleteOldAvailability",
	func: async () => {
		// weeks are indexed by their start, so a week that ended long enough ago
		// is one that started a week further back than that
		const cutOff = subDays(
			subMonths(new Date(), AVAILABILITY.RETENTION_MONTHS),
			WEEK_DAYS,
		);

		const { numDeletedRows } =
			await AvailabilityRepository.deleteWeeksStartedBefore(
				dateToDatabaseTimestamp(cutOff),
			);

		const { numDeletedRows: deletedTeamEvents } =
			await AvailabilityRepository.deleteTeamEventsEndedBefore(
				dateToDatabaseTimestamp(
					subMonths(new Date(), AVAILABILITY.RETENTION_MONTHS),
				),
			);

		logger.info(
			`Deleted ${numDeletedRows} old availability weeks and ${deletedTeamEvents} old team events`,
		);
	},
});
