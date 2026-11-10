import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedAction } from "~/utils/Test";
import * as FriendRepository from "../FriendRepository.server";
import type { friendsActionSchema } from "../friends-schemas.server";
import { action } from "./friends.server";

const friendsAction = wrappedAction<typeof friendsActionSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const senderId = () => users.id(1);
const receiverId = () => users.id(2);

describe("friends action SEND_REQUEST", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("sends a request to a user", async () => {
		const res = await friendsAction(
			{ _action: "SEND_REQUEST", userId: receiverId() },
			{ user: senderId() },
		);

		expect(res?.fieldErrors).toBeUndefined();
		expect(
			await FriendRepository.findFriendRequestBetween({
				senderId: senderId(),
				receiverId: receiverId(),
			}),
		).toBeDefined();
	});

	test("rejects a request to a placeholder player", async () => {
		const placeholder = await UserFactory.createPlaceholder();

		const res = await friendsAction(
			{ _action: "SEND_REQUEST", userId: placeholder.id },
			{ user: senderId() },
		);

		expect(res.fieldErrors.userId).toBe("forms:errors.userNotFound");
		expect(
			await FriendRepository.findFriendRequestBetween({
				senderId: senderId(),
				receiverId: placeholder.id,
			}),
		).toBeUndefined();
	});
});
