import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

/**
 * Creates reported results for a non-tournament calendar event, the way the event's
 * organizer reports them. `results` decides the placements and who played.
 *
 * Returns the result teams as they were created, so that a caller can pick one of
 * them (a result to highlight, say) by who played on it.
 */
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
