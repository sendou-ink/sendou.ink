import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	/** Who saved the tournament. */
	userId: number;
	tournamentId: number;
};

/**
 * Saves a tournament for a user, the way the star on its page does. Only a
 * tournament can be saved, a calendar event without one having nothing to save.
 */
export const { create } = defineFactory({
	insert: async ({ userId, tournamentId }: InsertArgs) => {
		await actAs(userId, () =>
			SavedCalendarEventRepository.saveOwn(tournamentId),
		);

		return { userId, tournamentId };
	},
});
