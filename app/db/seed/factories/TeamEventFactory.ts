import * as AvailabilityRepository from "~/features/availability/AvailabilityRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof AvailabilityRepository.insertTeamEvent
>[0] & {
	/** Team member creating the event, the way a manager does in production. */
	authorId: number;
};

/** Creates events a team takes part in together, e.g. a VoD review. */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Team event ${seq}`,
	}),
	insert: async ({ authorId, ...args }: InsertArgs) => ({
		id: await actAs(authorId, () =>
			AvailabilityRepository.insertTeamEvent(args),
		),
	}),
});
