import { addDays, subDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ChatMessageFactory from "~/db/seed/factories/ChatMessageFactory";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
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
