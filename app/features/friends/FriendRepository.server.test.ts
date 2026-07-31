import { beforeEach, describe, expect, test } from "vitest";
import * as FriendRequestFactory from "~/db/seed/factories/FriendRequestFactory";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as FriendRepository from "./FriendRepository.server";

const users = UserFactory.pool();

// friend rows are asserted by their Discord id, so the tests give the users one
// they can name
const createUsers = (count: number) =>
	users.create(count, (index) => ({ discordId: String(index) }));

describe("insertFriendRequest / findFriendRequestBetween", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("finds request from sender to receiver", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		expect(result).toBeDefined();
		expect(result!.id).toBeTypeOf("number");
	});

	test("finds request in reverse direction", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(2),
			receiverId: users.id(1),
		});

		expect(result).toBeDefined();
	});

	test("returns undefined for unrelated users", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(1),
			receiverId: users.id(3),
		});

		expect(result).toBeUndefined();
	});
});

describe("findPendingSentRequests / findPendingReceivedRequests", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("sent request appears in sender's sent requests", async () => {
		await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findPendingSentRequests(users.id(1));

		expect(result).toHaveLength(1);
		expect(result[0].receiverId).toBe(users.id(2));
	});

	test("sent request appears in receiver's received requests", async () => {
		await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findPendingReceivedRequests(
			users.id(2),
		);

		expect(result).toHaveLength(1);
		expect(result[0].senderId).toBe(users.id(1));
	});

	test("does not appear in wrong user's requests", async () => {
		await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const sent = await FriendRepository.findPendingSentRequests(users.id(3));
		const received = await FriendRepository.findPendingReceivedRequests(
			users.id(3),
		);

		expect(sent).toHaveLength(0);
		expect(received).toHaveLength(0);
	});
});

describe("countPendingSentRequests", () => {
	beforeEach(async () => {
		await createUsers(4);
	});

	test("returns 0 with no requests", async () => {
		const count = await FriendRepository.countPendingSentRequests(users.id(1));

		expect(count).toBe(0);
	});

	test("returns correct count after inserting multiple requests", async () => {
		await FriendRequestFactory.createMany(3, (index) => ({
			senderId: users.id(1),
			receiverId: users.id(index + 2),
		}));

		const count = await FriendRepository.countPendingSentRequests(users.id(1));

		expect(count).toBe(3);
	});
});

describe("deleteFriendRequest", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("deletes request by sender", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		await FriendRepository.deleteFriendRequest({
			id: request.id,
			senderId: users.id(1),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(1),
			receiverId: users.id(2),
		});
		expect(result).toBeUndefined();
	});

	test("does not delete when wrong senderId is used", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		await FriendRepository.deleteFriendRequest({
			id: request.id,
			senderId: users.id(3),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(1),
			receiverId: users.id(2),
		});
		expect(result).toBeDefined();
	});
});

describe("deleteFriendRequestByReceiver", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("deletes request by receiver", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		await FriendRepository.deleteFriendRequestByReceiver({
			id: request.id,
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(1),
			receiverId: users.id(2),
		});
		expect(result).toBeUndefined();
	});
});

describe("insertFriendship / findFriendship / findFriendIds", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("creates friendship and removes friend request", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(2),
			receiverId: users.id(1),
		});

		await FriendRepository.insertFriendship({
			userOneId: users.id(2),
			userTwoId: users.id(1),
			friendRequestId: request.id,
		});

		const friendship = await FriendRepository.findFriendship({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});
		expect(friendship).toBeDefined();

		const pendingRequest = await FriendRepository.findFriendRequestBetween({
			senderId: users.id(2),
			receiverId: users.id(1),
		});
		expect(pendingRequest).toBeUndefined();
	});

	test("normalizes IDs so userOneId < userTwoId", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(3),
			receiverId: users.id(1),
		});

		await FriendRepository.insertFriendship({
			userOneId: users.id(3),
			userTwoId: users.id(1),
			friendRequestId: request.id,
		});

		const friendship = await FriendRepository.findFriendship({
			userOneId: users.id(1),
			userTwoId: users.id(3),
		});
		expect(friendship).toBeDefined();
	});

	test("findFriendIds returns friend's ID", async () => {
		await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});

		const friendIds = await FriendRepository.findFriendIds(users.id(1));

		expect(friendIds).toHaveLength(1);
		expect(friendIds).toContain(users.id(2));
	});

	test("findFriendIds returns friend ID from both sides", async () => {
		await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});

		const friendIdsOfUser2 = await FriendRepository.findFriendIds(users.id(2));

		expect(friendIdsOfUser2).toHaveLength(1);
		expect(friendIdsOfUser2).toContain(users.id(1));
	});

	test("findFriendIds returns empty array with no friends", async () => {
		const friendIds = await FriendRepository.findFriendIds(users.id(1));

		expect(friendIds).toHaveLength(0);
	});
});

describe("deleteFriendship", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("removes friendship", async () => {
		const friendship = await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});

		await withUserId(users.id(1), () =>
			FriendRepository.deleteOwnFriendshipById(friendship.id),
		);

		const result = await FriendRepository.findFriendship({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});
		expect(result).toBeUndefined();
	});

	test("does not delete friendship user is not part of", async () => {
		const friendship = await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});

		await withUserId(users.id(3), () =>
			FriendRepository.deleteOwnFriendshipById(friendship.id),
		);

		const result = await FriendRepository.findFriendship({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});
		expect(result).toBeDefined();
	});
});

describe("findFriendRequestByIdAndReceiver", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("returns sender ID when request exists for receiver", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findFriendRequestByIdAndReceiver({
			id: request.id,
			receiverId: users.id(2),
		});

		expect(result).toBeDefined();
		expect(result!.senderId).toBe(users.id(1));
	});

	test("returns undefined for wrong receiver", async () => {
		const request = await FriendRequestFactory.create({
			senderId: users.id(1),
			receiverId: users.id(2),
		});

		const result = await FriendRepository.findFriendRequestByIdAndReceiver({
			id: request.id,
			receiverId: users.id(3),
		});

		expect(result).toBeUndefined();
	});
});

describe("findMutualFriends", () => {
	beforeEach(async () => {
		await createUsers(4);
	});

	test("returns mutual friend when two users share a common friend", async () => {
		await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(3),
		});
		await FriendshipFactory.create({
			userOneId: users.id(2),
			userTwoId: users.id(3),
		});

		const mutuals = await FriendRepository.findMutualFriends({
			loggedInUserId: users.id(1),
			targetUserId: users.id(2),
		});

		expect(mutuals).toHaveLength(1);
		expect(mutuals[0].id).toBe(users.id(3));
	});

	test("returns empty array when no common friends", async () => {
		await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(3),
		});
		await FriendshipFactory.create({
			userOneId: users.id(2),
			userTwoId: users.id(4),
		});

		const mutuals = await FriendRepository.findMutualFriends({
			loggedInUserId: users.id(1),
			targetUserId: users.id(2),
		});

		expect(mutuals).toHaveLength(0);
	});
});

describe("findByUserIdWithActivity", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	test("returns friends with friendshipId and createdAt", async () => {
		await FriendshipFactory.create({
			userOneId: users.id(1),
			userTwoId: users.id(2),
		});

		const result = await FriendRepository.findByUserIdWithActivity(users.id(1));

		const friendRow = result.find((r) => r.id === users.id(2));
		expect(friendRow).toBeDefined();
		expect(friendRow!.friendshipId).toBeTypeOf("number");
		expect(friendRow!.friendshipCreatedAt).toBeTypeOf("number");
	});

	test("returns empty array when user has no friends or team members", async () => {
		const result = await FriendRepository.findByUserIdWithActivity(users.id(1));

		expect(result).toHaveLength(0);
	});
});
