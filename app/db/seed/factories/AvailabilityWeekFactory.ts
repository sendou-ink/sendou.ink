import * as AvailabilityRepository from "~/features/availability/AvailabilityRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof AvailabilityRepository.upsertOwnWeek>[0] & {
	/** User whose week this is, saving it as they would themselves. */
	userId: number;
};

/**
 * Creates the availability one user reported for one week. Slots and day notes
 * are absolute, so a range crossing midnight is given as one slot like any other.
 * A week with no slots is the "unavailable all week" a user submits.
 */
export const { create } = defineFactory({
	defaults: () => ({
		timezone: "Europe/Helsinki",
		slots: [],
		dayNotes: [],
	}),
	insert: async ({ userId, ...args }: InsertArgs) => ({
		id: await actAs(userId, () => AvailabilityRepository.upsertOwnWeek(args)),
		userId,
	}),
});
