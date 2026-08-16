import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { defineFactory } from "../core/defineFactory";

type InsertRequestArgs = Parameters<
	typeof ScrimPostRepository.insertRequest
>[0];

type Request = Pick<InsertRequestArgs, "users"> &
	Partial<Pick<InsertRequestArgs, "startsAt">> & {
		/** Books the scrim, the way accepting a request does in production. Only one
		 * request of a post may be accepted. */
		isAccepted?: boolean;
	};

type Options = {
	/** Requests made to the post, created in the order given. */
	requests?: Array<Request>;
};

/**
 * Creates scrim posts. `users` is the side offering the scrim, one of them its owner.
 * The requests made to the post, and which of them booked it, are `options`.
 */
export const { create } = defineFactory({
	defaults: () => ({
		startsAt: databaseTimestampNow(),
		rangeEndsAt: null,
		maxDiv: null,
		minDiv: null,
		teamId: null,
		text: null,
		maps: null,
		mapsTournamentId: null,
		visibility: null,
		managedByAnyone: false,
		isScheduledForFuture: false,
	}),
	insert: async (args: Parameters<typeof ScrimPostRepository.insert>[0]) => ({
		id: await ScrimPostRepository.insert(args),
	}),
	applyOptions: async (post, { requests }: Options) => {
		for (const request of requests ?? []) {
			const requestId = await ScrimPostRepository.insertRequest({
				scrimPostId: post.id,
				teamId: null,
				message: null,
				startsAt: request.startsAt ?? null,
				users: request.users,
			});

			if (request.isAccepted) {
				await ScrimPostRepository.acceptRequest(requestId);
			}
		}
	},
});
