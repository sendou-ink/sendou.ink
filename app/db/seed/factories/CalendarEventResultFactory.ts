import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

/** Results of a non-tournament event as the organizer reports them. Returns the result teams as created. */
export const { create } = defineFactory({
	defaults: () => ({
		participantCount: faker.number.int({ min: 10, max: 250 }),
	}),
	insert: async (
		args: Parameters<typeof CalendarRepository.upsertReportedScores>[0],
	) => {
		await CalendarRepository.upsertReportedScores(args);

		return {
			eventId: args.eventId,
			teams: await CalendarRepository.findResultsByEventId(args.eventId),
		};
	},
});
