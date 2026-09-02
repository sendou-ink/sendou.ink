import * as AvailabilityRepository from "~/features/availability/AvailabilityRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof AvailabilityRepository.upsertOwnWeek>[0] & {
	/** User whose week this is, saving it as they would themselves. */
	userId: number;
};

/** Slots are absolute (a range crossing midnight is one slot). No slots = "unavailable all week". */
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
