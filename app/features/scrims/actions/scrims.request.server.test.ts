import { describe, expect, test, vi } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedAction } from "~/utils/Test";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import type { scrimRequestFormSchema } from "../scrims-schemas";
import { action as scrimsAction } from "./scrims.server";

// the action's fire-and-forget notification is not under test
vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: () => Promise.resolve(),
}));

const requestScrim = wrappedAction<typeof scrimRequestFormSchema>({
	action: scrimsAction,
	isJsonSubmission: true,
});

const requestsForPost = async (scrimPostId: number) =>
	(await ScrimPostRepository.findById(scrimPostId))?.requests;

describe("Scrim requests: pickup roster validation", () => {
	test("does not add a user who opted out of non-friend pickups (parity with post creation)", async () => {
		// attacker who sends the request (the built-in "regular" test user)
		await UserFactory.createRegular();

		// victim who explicitly opted out of being added to pickups by non-friends
		const victim = await UserFactory.create(null, {
			preferences: { disallowScrimPickupsFromUntrusted: true },
		});
		const [filler1, filler2] = await UserFactory.createMany(2);

		// some other team's public post to request against
		const [postOwner] = await UserFactory.createMany(1);
		const post = await ScrimPostFactory.create({
			users: [{ userId: postOwner.id, isOwner: 1 }],
		});

		const res = await requestScrim(
			{
				_action: "NEW_REQUEST",
				scrimPostId: post.id,
				from: {
					mode: "PICKUP",
					users: [victim.id, filler1.id, filler2.id],
				},
				message: null,
				at: null,
			},
			{ user: "regular" },
		);

		// post creation rejects this via validatePickupFriends; the request path must too
		expect(res?.fieldErrors?.from).toBeTruthy();
		expect(await requestsForPost(post.id)).toHaveLength(0);
	});
});
