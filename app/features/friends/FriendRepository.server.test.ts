import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dbReset, withUserId } from "~/utils/Test";
import * as FriendRepository from "./FriendRepository.server";

let users: Array<{ id: number }>;

const userId = (position: number) => users[position - 1].id;

// friend rows are asserted by their Discord id, so the tests give the users one
// they can name
const createUsers = async (count: number) => {
	users = await UserFactory.createMany(count, (index) => ({
		discordId: String(index),
	}));
};

const createFriendRequest = async ({
	senderId,
	receiverId,
}: {
	senderId: number;
	receiverId: number;
}) => {
	await FriendRepository.insertFriendRequest({ senderId, receiverId });
	const request = await FriendRepository.findFriendRequestBetween({
		senderId,
		receiverId,
	});
	return request!.id;
};

const createFriendship = async ({
	senderId,
	receiverId,
}: {
	senderId: number;
	receiverId: number;
}) => {
	const requestId = await createFriendRequest({ senderId, receiverId });
	await FriendRepository.insertFriendship({
		userOneId: senderId,
		userTwoId: receiverId,
		friendRequestId: requestId,
	});
};

describe("insertFriendRequest / findFriendRequestBetween", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("finds request from sender to receiver", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: userId(1),
			receiverId: userId(2),
		});

		expect(result).toBeDefined();
		expect(result!.id).toBeTypeOf("number");
	});

	test("finds request in reverse direction", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: userId(2),
			receiverId: userId(1),
		});

		expect(result).toBeDefined();
	});

	test("returns undefined for unrelated users", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: userId(1),
			receiverId: userId(3),
		});

		expect(result).toBeUndefined();
	});
});

describe("findPendingSentRequests / findPendingReceivedRequests", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("sent request appears in sender's sent requests", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findPendingSentRequests(userId(1));

		expect(result).toHaveLength(1);
		expect(result[0].receiverId).toBe(userId(2));
	});

	test("sent request appears in receiver's received requests", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findPendingReceivedRequests(
			userId(2),
		);

		expect(result).toHaveLength(1);
		expect(result[0].senderId).toBe(1);
	});

	test("does not appear in wrong user's requests", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const sent = await FriendRepository.findPendingSentRequests(userId(3));
		const received = await FriendRepository.findPendingReceivedRequests(
			userId(3),
		);

		expect(sent).toHaveLength(0);
		expect(received).toHaveLength(0);
	});
});

describe("countPendingSentRequests", () => {
	beforeEach(async () => {
		await createUsers(4);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns 0 with no requests", async () => {
		const count = await FriendRepository.countPendingSentRequests(userId(1));

		expect(count).toBe(0);
	});

	test("returns correct count after inserting multiple requests", async () => {
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(3),
		});
		await FriendRepository.insertFriendRequest({
			senderId: userId(1),
			receiverId: userId(4),
		});

		const count = await FriendRepository.countPendingSentRequests(userId(1));

		expect(count).toBe(3);
	});
});

describe("deleteFriendRequest", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("deletes request by sender", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		await FriendRepository.deleteFriendRequest({
			id: requestId,
			senderId: userId(1),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: userId(1),
			receiverId: userId(2),
		});
		expect(result).toBeUndefined();
	});

	test("does not delete when wrong senderId is used", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		await FriendRepository.deleteFriendRequest({
			id: requestId,
			senderId: userId(3),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: userId(1),
			receiverId: userId(2),
		});
		expect(result).toBeDefined();
	});
});

describe("deleteFriendRequestByReceiver", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("deletes request by receiver", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		await FriendRepository.deleteFriendRequestByReceiver({
			id: requestId,
			receiverId: userId(2),
		});

		const result = await FriendRepository.findFriendRequestBetween({
			senderId: userId(1),
			receiverId: userId(2),
		});
		expect(result).toBeUndefined();
	});
});

describe("insertFriendship / findFriendship / findFriendIds", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("creates friendship and removes friend request", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(2),
			receiverId: userId(1),
		});

		await FriendRepository.insertFriendship({
			userOneId: userId(2),
			userTwoId: userId(1),
			friendRequestId: requestId,
		});

		const friendship = await FriendRepository.findFriendship({
			userOneId: userId(1),
			userTwoId: userId(2),
		});
		expect(friendship).toBeDefined();

		const pendingRequest = await FriendRepository.findFriendRequestBetween({
			senderId: userId(2),
			receiverId: userId(1),
		});
		expect(pendingRequest).toBeUndefined();
	});

	test("normalizes IDs so userOneId < userTwoId", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(3),
			receiverId: userId(1),
		});

		await FriendRepository.insertFriendship({
			userOneId: userId(3),
			userTwoId: userId(1),
			friendRequestId: requestId,
		});

		const friendship = await FriendRepository.findFriendship({
			userOneId: userId(1),
			userTwoId: userId(3),
		});
		expect(friendship).toBeDefined();
	});

	test("findFriendIds returns friend's ID", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(2) });

		const friendIds = await FriendRepository.findFriendIds(userId(1));

		expect(friendIds).toHaveLength(1);
		expect(friendIds).toContain(userId(2));
	});

	test("findFriendIds returns friend ID from both sides", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(2) });

		const friendIdsOfUser2 = await FriendRepository.findFriendIds(userId(2));

		expect(friendIdsOfUser2).toHaveLength(1);
		expect(friendIdsOfUser2).toContain(userId(1));
	});

	test("findFriendIds returns empty array with no friends", async () => {
		const friendIds = await FriendRepository.findFriendIds(userId(1));

		expect(friendIds).toHaveLength(0);
	});
});

describe("deleteFriendship", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("removes friendship", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(2) });

		const friendship = await FriendRepository.findFriendship({
			userOneId: userId(1),
			userTwoId: userId(2),
		});

		await withUserId(userId(1), () =>
			FriendRepository.deleteOwnFriendshipById(friendship!.id),
		);

		const result = await FriendRepository.findFriendship({
			userOneId: userId(1),
			userTwoId: userId(2),
		});
		expect(result).toBeUndefined();
	});

	test("does not delete friendship user is not part of", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(2) });

		const friendship = await FriendRepository.findFriendship({
			userOneId: userId(1),
			userTwoId: userId(2),
		});

		await withUserId(userId(3), () =>
			FriendRepository.deleteOwnFriendshipById(friendship!.id),
		);

		const result = await FriendRepository.findFriendship({
			userOneId: userId(1),
			userTwoId: userId(2),
		});
		expect(result).toBeDefined();
	});
});

describe("findFriendRequestByIdAndReceiver", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns sender ID when request exists for receiver", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findFriendRequestByIdAndReceiver({
			id: requestId,
			receiverId: userId(2),
		});

		expect(result).toBeDefined();
		expect(result!.senderId).toBe(1);
	});

	test("returns undefined for wrong receiver", async () => {
		const requestId = await createFriendRequest({
			senderId: userId(1),
			receiverId: userId(2),
		});

		const result = await FriendRepository.findFriendRequestByIdAndReceiver({
			id: requestId,
			receiverId: userId(3),
		});

		expect(result).toBeUndefined();
	});
});

describe("findMutualFriends", () => {
	beforeEach(async () => {
		await createUsers(4);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns mutual friend when two users share a common friend", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(3) });
		await createFriendship({ senderId: userId(2), receiverId: userId(3) });

		const mutuals = await FriendRepository.findMutualFriends({
			loggedInUserId: userId(1),
			targetUserId: userId(2),
		});

		expect(mutuals).toHaveLength(1);
		expect(mutuals[0].id).toBe(userId(3));
	});

	test("returns empty array when no common friends", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(3) });
		await createFriendship({ senderId: userId(2), receiverId: userId(4) });

		const mutuals = await FriendRepository.findMutualFriends({
			loggedInUserId: userId(1),
			targetUserId: userId(2),
		});

		expect(mutuals).toHaveLength(0);
	});
});

describe("findByUserIdWithActivity", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns friends with friendshipId and createdAt", async () => {
		await createFriendship({ senderId: userId(1), receiverId: userId(2) });

		const result = await FriendRepository.findByUserIdWithActivity(userId(1));

		const friendRow = result.find((r) => r.discordId === "1");
		expect(friendRow).toBeDefined();
		expect(friendRow!.friendshipId).toBeTypeOf("number");
		expect(friendRow!.friendshipCreatedAt).toBeTypeOf("number");
	});

	test("returns empty array when user has no friends or team members", async () => {
		const result = await FriendRepository.findByUserIdWithActivity(userId(1));

		expect(result).toHaveLength(0);
	});
});
