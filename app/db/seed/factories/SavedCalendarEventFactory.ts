import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	/** Who saved the tournament. */
	userId: number;
	tournamentId: number;
};

/** Like the star on a tournament page. Only tournaments can be saved. */
export const { create } = defineFactory({
	insert: async ({ userId, tournamentId }: InsertArgs) => {
		await actAs(userId, () =>
			SavedCalendarEventRepository.saveOwn(tournamentId),
		);

		return { userId, tournamentId };
	},
});
