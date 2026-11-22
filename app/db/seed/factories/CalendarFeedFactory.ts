import * as CalendarFeedRepository from "~/features/calendar/CalendarFeedRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	userId: number;
};

/** Creates a user's personal iCalendar feed, returning the secret token of its URL. */
export const { create } = defineFactory({
	insert: async ({ userId }: InsertArgs) => {
		const token = await actAs(userId, async () => {
			await CalendarFeedRepository.upsertOwnToken();
			return CalendarFeedRepository.findOwnToken();
		});
		if (!token) throw new Error("Calendar feed token was not created");

		return { token };
	},
});
