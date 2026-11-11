import * as ScrimMapListRepository from "~/features/scrims/ScrimMapListRepository.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { defineFactory } from "../core/defineFactory";

type InsertRequestArgs = Parameters<
	typeof ScrimPostRepository.insertRequest
>[0];

type Request = Pick<InsertRequestArgs, "users"> &
	Partial<Pick<InsertRequestArgs, "startsAt">> & {
		/** Books the scrim. Only one request of a post may be accepted. */
		isAccepted?: boolean;
	};

type Options = {
	/** Requests made to the post, created in the order given. */
	requests?: Array<Request>;
	/** Map lists the sides submitted, after the requests are created. */
	mapLists?: Array<
		Omit<
			Parameters<
				typeof ScrimMapListRepository.submitMapListAndGenerateIfNeeded
			>[0],
			"scrimPostId"
		>
	>;
};

/** `users` is the side offering the scrim, one of them its owner. Requests to the post are `options`. */
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
	applyOptions: async (post, { requests, mapLists }: Options) => {
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

		for (const mapList of mapLists ?? []) {
			await ScrimMapListRepository.submitMapListAndGenerateIfNeeded({
				...mapList,
				scrimPostId: post.id,
			});
		}
	},
});
