import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { SerializeFrom } from "~/utils/remix";
import {
	dbInsertUsers,
	dbReset,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import { action } from "../actions/scrims.new.server";
import { loader } from "../loaders/scrims.server";
import type { scrimsNewActionSchema } from "../scrims-schemas";

const newScrimAction = wrappedAction<typeof scrimsNewActionSchema>({
	action,
	isJsonSubmission: true,
});

const scrimPostsLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const defaultNewScrimPostArgs: Parameters<typeof newScrimAction>[0] = {
	at: new Date(),
	rangeEnd: null,
	baseVisibility: "PUBLIC",
	divs: { min: null, max: null },
	from: {
		mode: "PICKUP",
		users: [1, 3, 4],
	},
	managedByAnyone: false,
	postText: "Test",
	notFoundVisibility: {
		forAssociation: "PUBLIC",
	},
	maps: "NO_PREFERENCE",
	mapsTournamentId: null,
};

describe("New scrim post action", () => {
	beforeEach(() => {
		dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("scrim post made for now has isScheduledForFuture = false", async () => {
		const response = await newScrimAction(
			{
				...defaultNewScrimPostArgs,
				at: new Date(),
			},
			{
				user: "regular",
			},
		);

		expect(response).toBeInstanceOf(Response);

		const { posts } = await scrimPostsLoader();

		expect(posts.neutral).toHaveLength(1);
		expect(posts.neutral[0]!.isScheduledForFuture).toBe(false);
	});

	test("scrim post made for future has isScheduledForFuture = true", async () => {
		const response = await newScrimAction(
			{
				...defaultNewScrimPostArgs,
				at: add(new Date(), { hours: 12 }),
			},
			{
				user: "regular",
			},
		);

		expect(response).toBeInstanceOf(Response);

		const { posts } = await scrimPostsLoader();

		expect(posts.neutral).toHaveLength(1);
		expect(posts.neutral[0]!.isScheduledForFuture).toBe(true);
	});
});
