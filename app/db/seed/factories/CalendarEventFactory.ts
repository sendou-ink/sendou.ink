import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type InsertArgs = Omit<
	Parameters<typeof CalendarRepository.insert>[0],
	"isFullTournament" | "bracketProgression" | "mapPickingStyle"
>;

export const { create } = defineFactory({
	defaults: () => ({
		name: faker.company.name(),
		description: null,
		discordInviteCode: null,
		bracketUrl: faker.internet.url(),
		organizationId: null,
		tags: null,
		badges: [],
		rules: null,
		startTimes: [databaseTimestampNow()],
	}),
	insert: async (args: InsertArgs) => {
		const { eventId } = await CalendarRepository.insert({
			...args,
			isFullTournament: false,
			bracketProgression: null,
			// only read for events with a tournament of their own
			mapPickingStyle: "AUTO_ALL",
		});

		return { id: eventId };
	},
});
