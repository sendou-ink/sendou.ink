import { describe, expect, test, vi } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { wrappedAction } from "~/utils/Test";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { SCRIMS_CHANNEL } from "../scrims-constants";
import type {
	scrimRequestFormSchema,
	scrimsActionSchema,
} from "../scrims-schemas";
import { action as scrimsAction } from "./scrims.server";

const requestScrim = wrappedAction<typeof scrimRequestFormSchema>({
	action: scrimsAction,
	isJsonSubmission: true,
});

vi.mock("~/features/chat/ChatSystemMessage.server", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("~/features/chat/ChatSystemMessage.server")
	>()),
	send: vi.fn(),
}));

const postAction = wrappedAction<typeof scrimsActionSchema>({
	action: scrimsAction,
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

describe("Scrim posts: live scrims list", () => {
	test("deleting a post refreshes the scrims list", async () => {
		const [postOwner] = await UserFactory.createMany(1);
		const post = await ScrimPostFactory.create({
			users: [{ userId: postOwner.id, isOwner: 1 }],
		});
		vi.mocked(ChatSystemMessage.send).mockClear();

		await postAction(
			{ _action: "DELETE_POST", scrimPostId: post.id },
			{ user: postOwner.id },
		);

		expect(ChatSystemMessage.send).toHaveBeenCalledWith({
			channel: SCRIMS_CHANNEL,
		});
	});
});
