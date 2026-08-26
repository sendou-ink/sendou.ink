import { addDays, subDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ChatMessageFactory from "~/db/seed/factories/ChatMessageFactory";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import * as ChatRepository from "./ChatRepository.server";

const users = UserFactory.pool();

beforeEach(async () => {
	await users.create(2);
});

describe("ChatRepository.insertMessage", () => {
	test("returns the inserted row", async () => {
		const room = await ChatRoomFactory.create();

		const message = await ChatRepository.insertMessage({
			roomId: room.id,
			authorUserId: users.id(1),
			contents: "hello",
			publicId: "abc123",
		});

		expect(message.roomId).toBe(room.id);
		expect(message.authorUserId).toBe(users.id(1));
		expect(message.contents).toBe("hello");
		expect(message.type).toBeNull();
	});

	test("retried insert with the same publicId returns the existing row without double-inserting", async () => {
		const room = await ChatRoomFactory.create();

		const first = await ChatRepository.insertMessage({
			roomId: room.id,
			authorUserId: users.id(1),
			contents: "hello",
			publicId: "abc123",
		});
		const retried = await ChatRepository.insertMessage({
			roomId: room.id,
			authorUserId: users.id(1),
			contents: "hello again",
			publicId: "abc123",
		});

		expect(retried.id).toBe(first.id);
		expect(retried.contents).toBe("hello");

		const count = await db
			.selectFrom("ChatMessage")
			.select(({ fn }) => fn.countAll<number>().as("count"))
			.where("ChatMessage.roomId", "=", room.id)
			.executeTakeFirstOrThrow();
		expect(count.count).toBe(1);
	});
});

describe("ChatRepository.insertSystemMessage", () => {
	test("inserts a typed message with no contents", async () => {
		const room = await ChatRoomFactory.create();

		const message = await ChatRepository.insertSystemMessage({
			roomId: room.id,
			type: "SCORE_REPORTED",
			authorUserId: users.id(1),
		});

		expect(message.type).toBe("SCORE_REPORTED");
		expect(message.contents).toBeNull();
		expect(message.authorUserId).toBe(users.id(1));
		expect(message.publicId).not.toBe("");
	});
});

describe("ChatRepository.findAllMessagesByRoomId", () => {
	test("returns messages oldest first with authors resolved", async () => {
		const room = await ChatRoomFactory.create();
		await ChatMessageFactory.create({
			roomId: room.id,
			authorUserId: users.id(1),
		});
		await ChatMessageFactory.create({
			roomId: room.id,
			authorUserId: users.id(2),
		});

		const messages = await ChatRepository.findAllMessagesByRoomId(room.id);

		expect(messages).toHaveLength(2);
		expect(messages[0].id).toBeLessThan(messages[1].id);
		expect(messages[0].author?.id).toBe(users.id(1));
		expect(messages[1].author?.id).toBe(users.id(2));
		expect(messages[0].author?.username).toBeTruthy();
	});

	test("keeps the latest messages when over the limit", async () => {
		const room = await ChatRoomFactory.create();
		const [, second, third] = await ChatMessageFactory.createMany(3, {
			roomId: room.id,
			authorUserId: users.id(1),
		});

		const messages = await ChatRepository.findAllMessagesByRoomId(room.id, {
			limit: 2,
		});

		expect(messages.map((message) => message.id)).toEqual([
			second.id,
			third.id,
		]);
	});

	test("does not return another room's messages", async () => {
		const room = await ChatRoomFactory.create();
		const otherRoom = await ChatRoomFactory.create();
		await ChatMessageFactory.create({
			roomId: room.id,
			authorUserId: users.id(1),
		});
		await ChatMessageFactory.create({
			roomId: otherRoom.id,
			authorUserId: users.id(1),
		});

		const messages = await ChatRepository.findAllMessagesByRoomId(room.id);

		expect(messages).toHaveLength(1);
		expect(messages[0].roomId).toBe(room.id);
	});
});

describe("ChatRepository.findMessageById", () => {
	test("returns the message with its author resolved", async () => {
		const room = await ChatRoomFactory.create();
		const inserted = await ChatMessageFactory.create({
			roomId: room.id,
			authorUserId: users.id(1),
		});

		const message = await ChatRepository.findMessageById(inserted.id);

		expect(message?.roomId).toBe(room.id);
		expect(message?.author?.id).toBe(users.id(1));
		expect(message?.author?.username).toBeTruthy();
	});

	test("returns undefined for an unknown id", async () => {
		expect(await ChatRepository.findMessageById(424242)).toBeUndefined();
	});
});

describe("ChatRepository.findMessageStatsByRoomIds", () => {
	test("counts messages newer than the user's read indicator per room", async () => {
		const room = await ChatRoomFactory.create();
		const otherRoom = await ChatRoomFactory.create();
		const [first, , third] = await ChatMessageFactory.createMany(3, {
			roomId: room.id,
			authorUserId: users.id(2),
		});
		const otherRoomMessage = await ChatMessageFactory.create({
			roomId: otherRoom.id,
			authorUserId: users.id(2),
		});
		await ChatRepository.upsertReadIndicator({
			userId: users.id(1),
			roomId: room.id,
			lastSeenMessageId: first.id,
		});

		const stats = await ChatRepository.findMessageStatsByRoomIds(users.id(1), [
			room.id,
			otherRoom.id,
		]);

		expect(stats.sort((a, b) => a.roomId - b.roomId)).toEqual([
			{
				roomId: room.id,
				unreadCount: 2,
				latestMessageId: third.id,
				latestMessageCreatedAt: third.createdAt,
			},
			{
				roomId: otherRoom.id,
				unreadCount: 1,
				latestMessageId: otherRoomMessage.id,
				latestMessageCreatedAt: otherRoomMessage.createdAt,
			},
		]);
	});

	test("returns a zero unread count once everything is read", async () => {
		const room = await ChatRoomFactory.create();
		const message = await ChatMessageFactory.create({
			roomId: room.id,
			authorUserId: users.id(2),
		});
		await ChatRepository.upsertReadIndicator({
			userId: users.id(1),
			roomId: room.id,
			lastSeenMessageId: message.id,
		});

		expect(
			await ChatRepository.findMessageStatsByRoomIds(users.id(1), [room.id]),
		).toEqual([
			{
				roomId: room.id,
				unreadCount: 0,
				latestMessageId: message.id,
				latestMessageCreatedAt: message.createdAt,
			},
		]);
	});

	test("leaves out rooms with no messages", async () => {
		const room = await ChatRoomFactory.create();

		expect(
			await ChatRepository.findMessageStatsByRoomIds(users.id(1), [room.id]),
		).toEqual([]);
	});

	test("returns an empty array for no room ids", async () => {
		expect(
			await ChatRepository.findMessageStatsByRoomIds(users.id(1), []),
		).toEqual([]);
	});
});

describe("ChatRepository.upsertReadIndicator", () => {
	test("creates the indicator on first upsert", async () => {
		const room = await ChatRoomFactory.create();

		await ChatRepository.upsertReadIndicator({
			userId: users.id(1),
			roomId: room.id,
			lastSeenMessageId: 5,
		});

		const indicator = await readIndicator(users.id(1), room.id);
		expect(indicator.lastSeenMessageId).toBe(5);
	});

	test("never regresses to an older message", async () => {
		const room = await ChatRoomFactory.create();

		await ChatRepository.upsertReadIndicator({
			userId: users.id(1),
			roomId: room.id,
			lastSeenMessageId: 5,
		});
		await ChatRepository.upsertReadIndicator({
			userId: users.id(1),
			roomId: room.id,
			lastSeenMessageId: 3,
		});

		expect((await readIndicator(users.id(1), room.id)).lastSeenMessageId).toBe(
			5,
		);

		await ChatRepository.upsertReadIndicator({
			userId: users.id(1),
			roomId: room.id,
			lastSeenMessageId: 9,
		});

		expect((await readIndicator(users.id(1), room.id)).lastSeenMessageId).toBe(
			9,
		);
	});
});

describe("ChatRepository.updateRoomsInactive", () => {
	test("marks the given rooms inactive and back active", async () => {
		const room = await ChatRoomFactory.create();
		const otherRoom = await ChatRoomFactory.create();

		await ChatRepository.updateRoomsInactive([room.id], true);

		expect((await roomById(room.id)).inactive).toBe(1);
		expect((await roomById(otherRoom.id)).inactive).toBe(0);

		await ChatRepository.updateRoomsInactive([room.id], false);

		expect((await roomById(room.id)).inactive).toBe(0);
	});

	test("ignores null room ids", async () => {
		await expect(
			ChatRepository.updateRoomsInactive([null, null], true),
		).resolves.toBeUndefined();
	});
});

describe("ChatRepository.closeExpiredRooms", () => {
	test("closes only rooms expired before the cutoff", async () => {
		const expiredRoom = await ChatRoomFactory.create({
			expiresAt: subDays(new Date(), 60),
		});
		const openRoom = await ChatRoomFactory.create({
			expiresAt: addDays(new Date(), 1),
		});

		const closedCount = await ChatRepository.closeExpiredRooms(
			subDays(new Date(), 30),
		);

		expect(closedCount).toBe(1);
		expect((await roomById(expiredRoom.id)).closedAt).not.toBeNull();
		expect((await roomById(openRoom.id)).closedAt).toBeNull();
	});

	test("leaves already-closed rooms untouched", async () => {
		await ChatRoomFactory.create({ expiresAt: subDays(new Date(), 60) });
		await ChatRepository.closeExpiredRooms(subDays(new Date(), 30));

		const closedAgainCount = await ChatRepository.closeExpiredRooms(
			subDays(new Date(), 30),
		);

		expect(closedAgainCount).toBe(0);
	});
});

describe("ChatRepository.deleteOrphanedRooms", () => {
	// each type is checked against its own owner table alone, so every one needs covering
	test.each([
		"SQ_GROUP",
		"SQ_MATCH",
		"TOURNAMENT_MATCH",
		"TOURNAMENT_TEAM",
		"SCRIM",
	] as const)("deletes an orphaned %s room", async (type) => {
		const orphanedRoom = await ChatRoomFactory.create({ type });

		const deletedCount = await ChatRepository.deleteOrphanedRooms();

		expect(deletedCount).toBe(1);
		await expect(roomById(orphanedRoom.id)).rejects.toThrow();
	});

	test("keeps a room its owner still points at", async () => {
		const group = await SQGroupFactory.create({
			memberUserIds: [users.id(1)],
		});
		const chatRoomId = await groupChatRoomId(group.id);

		const deletedCount = await ChatRepository.deleteOrphanedRooms();

		expect(deletedCount).toBe(0);
		expect((await roomById(chatRoomId)).id).toBe(chatRoomId);
	});
});

const groupChatRoomId = async (groupId: number) => {
	const group = await db
		.selectFrom("Group")
		.select("Group.chatRoomId")
		.where("Group.id", "=", groupId)
		.executeTakeFirstOrThrow();

	invariant(group.chatRoomId, "Group has no chat room");

	return group.chatRoomId;
};

const readIndicator = (userId: number, roomId: number) =>
	db
		.selectFrom("ChatMessageReadIndicator")
		.selectAll()
		.where("userId", "=", userId)
		.where("roomId", "=", roomId)
		.executeTakeFirstOrThrow();

const roomById = (id: number) =>
	db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirstOrThrow();
