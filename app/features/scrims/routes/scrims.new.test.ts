import { add } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { SerializeFrom } from "~/utils/remix";
import { wrappedAction, wrappedLoader } from "~/utils/Test";
import { action } from "../actions/scrims.new.server";
import { loader as scrimsNewLoader } from "../loaders/scrims.new.server";
import { loader } from "../loaders/scrims.server";
import type { scrimsNewFormSchema } from "../scrims-schemas";

const newScrimAction = wrappedAction<typeof scrimsNewFormSchema>({
	action,
	isJsonSubmission: true,
});

const scrimPostsLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const newScrimPostLoader = wrappedLoader<SerializeFrom<typeof scrimsNewLoader>>(
	{
		loader: scrimsNewLoader,
	},
);

const defaultNewScrimPostArgs = (): Parameters<typeof newScrimAction>[0] => ({
	at: new Date(),
	rangeEnd: null,
	baseVisibility: "PUBLIC",
	divs: [null, null],
	from: {
		mode: "PICKUP",
		users: pickupMembers.ids(),
	},
	managedByAnyone: false,
	postText: "Test",
	notFoundVisibility: {
		forAssociation: "PUBLIC",
	},
	maps: "NO_PREFERENCE",
	mapsTournamentId: null,
});

const pickupMembers = UserFactory.pool();

describe("New scrim post action", () => {
	beforeEach(async () => {
		await UserFactory.createRegular();
		await pickupMembers.create(3);
	});

	test("scrim post made for now has isScheduledForFuture = false", async () => {
		const response = await newScrimAction(
			{
				...defaultNewScrimPostArgs(),
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
				...defaultNewScrimPostArgs(),
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

	test("scrim post made as a pick-up saves the roster for reuse", async () => {
		await newScrimAction(defaultNewScrimPostArgs(), { user: "regular" });

		const { recentPickupRosters } = await newScrimPostLoader({
			user: "regular",
		});

		expect(recentPickupRosters).toHaveLength(1);
		expect(recentPickupRosters[0]!.users.map((user) => user.id)).toEqual(
			pickupMembers.ids().sort((a, b) => a - b),
		);
	});
});
