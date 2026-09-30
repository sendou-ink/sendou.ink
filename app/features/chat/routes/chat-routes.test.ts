import { subHours } from "date-fns";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { chatRoomChannel, userChannel } from "~/features/events/events-types";
import {
	abortSubscriptions,
	flushEvents,
	subscribeTo,
} from "~/features/events/tests/fixtures";
import { withUserId } from "~/utils/Test";
import * as ChatRepository from "../ChatRepository.server";
import { setupSqMatch } from "../tests/fixtures";
import { loader as roomsLoader } from "./api.chat.rooms";
import { loader as roomLoader } from "./api.chat.rooms.$id";
import {
	loader as messagesLoader,
	action as sendAction,
} from "./api.chat.rooms.$id.messages";
import { action as readAction } from "./api.chat.rooms.$id.read";

const users = UserFactory.pool();

// ADMIN_ID is 1 under NODE_ENV=test, so the first pool user is site staff
const adminId = () => users.id(1);
const outsiderId = () => users.id(11);

beforeEach(async () => {
	await users.create(11);
});

afterEach(() => {
	abortSubscriptions();
});

describe("chat messages action", () => {
	test("inserts the message and returns it with the author resolved", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const message = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "aaaaaaaaaa",
			contents: "hello",
		});

		expect(message.roomId).toBe(match.chatRoomId);
		expect(message.contents).toBe("hello");
		expect(message.authorUserId).toBe(alphaUserIds[0]);
		expect(message.author?.username).toEqual(expect.any(String));
	});

	test("publishes the message to participant user channels and the room channel", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		const bravoReceived = subscribeTo(userChannel(bravoUserIds[0]));
		const roomReceived = subscribeTo(chatRoomChannel(match.chatRoomId!));

		const message = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "bbbbbbbbbb",
			contents: "hello",
		});
		await flushEvents();

		expect(bravoReceived).toEqual([
			{ kind: "chatMessage", roomId: match.chatRoomId, message },
		]);
		expect(roomReceived).toEqual([
			{ kind: "chatMessage", roomId: match.chatRoomId, message },
		]);
	});

	test("retried send with the same publicId returns the existing message without publishing a duplicate row", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const first = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "cccccccccc",
			contents: "hello",
		});
		const retried = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "cccccccccc",
			contents: "hello again",
		});

		expect(retried.id).toBe(first.id);
		expect(retried.contents).toBe("hello");

		const count = await db
			.selectFrom("ChatMessage")
			.select(({ fn }) => fn.countAll<number>().as("count"))
			.where("ChatMessage.roomId", "=", match.chatRoomId!)
			.executeTakeFirstOrThrow();
		expect(count.count).toBe(1);
	});

	test("returns field errors for empty contents", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const result = await sendMessage(alphaUserIds[0], match.chatRoomId!, {
			publicId: "dddddddddd",
			contents: "",
		});

		expect(result).toHaveProperty("fieldErrors");
	});

	test("403s a non-participant", async () => {
		const { match } = await setupSqMatch(users);

		expect(
			await statusOf(
				sendMessage(outsiderId(), match.chatRoomId!, {
					publicId: "eeeeeeeeee",
					contents: "hello",
				}),
			),
		).toBe(403);
	});

	test("site staff observer can post into the match chat", async () => {
		const { match } = await setupSqMatch(users);

		const message = await sendMessageOk(adminId(), match.chatRoomId!, {
			publicId: "ssssssssss",
			contents: "staff here",
		});

		expect(message.authorUserId).toBe(adminId());
	});

	test("403s a participant once the room has expired", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		await ChatRepository.updateRoomExpiresAt({
			roomId: match.chatRoomId!,
			expiresAt: subHours(new Date(), 1),
		});

		expect(
			await statusOf(
				sendMessage(alphaUserIds[0], match.chatRoomId!, {
					publicId: "ffffffffff",
					contents: "hello",
				}),
			),
		).toBe(403);
	});

	test("400s a publicId already claimed by another user's message", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "gggggggggg",
			contents: "hello",
		});

		expect(
			await statusOf(
				sendMessage(bravoUserIds[0], match.chatRoomId!, {
					publicId: "gggggggggg",
					contents: "not mine",
				}),
			),
		).toBe(400);
	});

	test("404s a room id with no owner", async () => {
		expect(
			await statusOf(
				sendMessage(outsiderId(), 424242, {
					publicId: "hhhhhhhhhh",
					contents: "hello",
				}),
			),
		).toBe(404);
	});
});

describe("chat rooms loader", () => {
	test("returns the user's rooms with server-computed unread counts", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "iiiiiiiiii",
			contents: "hello",
		});

		const data = await loadRooms(bravoUserIds[0]);
		const matchRoom = data.rooms.find((room) => room.id === match.chatRoomId);

		expect(matchRoom).toMatchObject({
			type: "SQ_MATCH",
			unreadCount: 1,
			url: expect.stringContaining(String(match.id)),
		});
		expect(matchRoom?.participantUserIds).toHaveLength(8);
	});

	test("exposes the room's inactive flag and latest message stats", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		const message = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "oooooooooo",
			contents: "hello",
		});
		await ChatRepository.updateRoomsInactive([match.chatRoomId], true);

		const data = await loadRooms(bravoUserIds[0]);
		const matchRoom = data.rooms.find((room) => room.id === match.chatRoomId);

		expect(matchRoom).toMatchObject({
			inactive: true,
			latestMessageId: message.id,
			latestMessageAt: message.createdAt,
		});
	});

	test("marks a participant's own room postable", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const data = await loadRooms(alphaUserIds[0]);
		const matchRoom = data.rooms.find((room) => room.id === match.chatRoomId);

		expect(matchRoom?.canPost).toBe(true);
	});

	test("does not count the sender's own message as unread on their other devices", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "jjjjjjjjjj",
			contents: "hello",
		});

		const data = await loadRooms(alphaUserIds[0]);
		const matchRoom = data.rooms.find((room) => room.id === match.chatRoomId);

		expect(matchRoom?.unreadCount).toBe(0);
	});
});

describe("chat read action", () => {
	test("marking read clears the room's unread count", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		const message = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "kkkkkkkkkk",
			contents: "hello",
		});

		await markRead(bravoUserIds[0], match.chatRoomId!, message.id);

		const data = await loadRooms(bravoUserIds[0]);
		const matchRoom = data.rooms.find((room) => room.id === match.chatRoomId);
		expect(matchRoom?.unreadCount).toBe(0);
	});

	test("403s a non-participant", async () => {
		const { match } = await setupSqMatch(users);

		expect(await statusOf(markRead(outsiderId(), match.chatRoomId!, 1))).toBe(
			403,
		);
	});
});

describe("chat room messages loader", () => {
	test("returns the room's messages oldest first for a participant", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "llllllllll",
			contents: "first",
		});
		await sendMessageOk(bravoUserIds[0], match.chatRoomId!, {
			publicId: "mmmmmmmmmm",
			contents: "second",
		});

		const data = await loadMessages(alphaUserIds[1], match.chatRoomId!);

		expect(data.messages.map((message) => message.contents)).toEqual([
			"first",
			"second",
		]);
		expect(data.messages[0].author?.username).toEqual(expect.any(String));
	});

	test("site staff observer can read the room", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "nnnnnnnnnn",
			contents: "hello",
		});

		const data = await loadMessages(adminId(), match.chatRoomId!);

		expect(data.messages).toHaveLength(1);
	});

	test("403s a non-participant", async () => {
		const { match } = await setupSqMatch(users);

		expect(await statusOf(loadMessages(outsiderId(), match.chatRoomId!))).toBe(
			403,
		);
	});

	test("404s an unknown room", async () => {
		expect(await statusOf(loadMessages(outsiderId(), 424242))).toBe(404);
	});
});

describe("chat room loader", () => {
	test("returns the room's info to a staff observer outside the room list", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		const message = await sendMessageOk(alphaUserIds[0], match.chatRoomId!, {
			publicId: "rrrrrrrrrr",
			contents: "hello",
		});

		const data = await loadRoom(adminId(), match.chatRoomId!);

		expect(data.room).toMatchObject({
			id: match.chatRoomId,
			type: "SQ_MATCH",
			latestMessageId: message.id,
		});
		expect(data.room.participantUserIds).toHaveLength(8);
	});

	test("403s a non-participant", async () => {
		const { match } = await setupSqMatch(users);

		expect(await statusOf(loadRoom(outsiderId(), match.chatRoomId!))).toBe(403);
	});

	test("a staff observer may post in the match room but only read a group room", async () => {
		const { match } = await setupSqMatch(users);
		const groupRoomId = await groupChatRoomId(match.alphaGroup.id);

		const matchRoom = await loadRoom(adminId(), match.chatRoomId!);
		const groupRoom = await loadRoom(adminId(), groupRoomId!);

		expect(matchRoom.room.canPost).toBe(true);
		expect(groupRoom.room.canPost).toBe(false);
	});

	test("participant loses the room once it is closed, site staff keeps it", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		await ChatRepository.updateRoomExpiresAt({
			roomId: match.chatRoomId!,
			expiresAt: subHours(new Date(), 1),
		});
		await ChatRepository.closeExpiredRooms(new Date());

		expect(await statusOf(loadRoom(alphaUserIds[0], match.chatRoomId!))).toBe(
			403,
		);
		expect(await statusOf(loadRoom(adminId(), match.chatRoomId!))).toBe(200);
	});

	test("404s an unknown room", async () => {
		expect(await statusOf(loadRoom(adminId(), 424242))).toBe(404);
	});
});

function groupChatRoomId(groupId: number) {
	return db
		.selectFrom("Group")
		.select("Group.chatRoomId")
		.where("Group.id", "=", groupId)
		.executeTakeFirstOrThrow()
		.then((group) => group.chatRoomId);
}

function sendMessage(
	userId: number,
	roomId: number,
	body: Record<string, unknown>,
) {
	const request = new Request(
		`http://app.com/api/chat/rooms/${roomId}/messages`,
		{
			method: "POST",
			body: JSON.stringify(body),
			headers: [["Content-Type", "application/json"]],
		},
	);

	return withUserId(userId, () =>
		sendAction({
			request,
			params: { id: String(roomId) },
			context: {} as any,
			pattern: "",
			url: new URL(request.url),
		} as ActionFunctionArgs),
	);
}

async function sendMessageOk(
	userId: number,
	roomId: number,
	body: Record<string, unknown>,
) {
	const result = await sendMessage(userId, roomId, body);
	if ("fieldErrors" in result) {
		throw new Error(`send failed: ${JSON.stringify(result.fieldErrors)}`);
	}

	return result.message;
}

function markRead(userId: number, roomId: number, lastSeenMessageId: number) {
	const request = new Request(`http://app.com/api/chat/rooms/${roomId}/read`, {
		method: "POST",
		body: JSON.stringify({ lastSeenMessageId }),
		headers: [["Content-Type", "application/json"]],
	});

	return withUserId(userId, () =>
		readAction({
			request,
			params: { id: String(roomId) },
			context: {} as any,
			pattern: "",
			url: new URL(request.url),
		} as ActionFunctionArgs),
	);
}

function loadRooms(userId: number) {
	return withUserId(userId, () => roomsLoader());
}

function loadRoom(userId: number, roomId: number) {
	const request = new Request(`http://app.com/api/chat/rooms/${roomId}`);

	return withUserId(userId, () =>
		roomLoader({
			request,
			params: { id: String(roomId) },
			context: {} as any,
			pattern: "",
			url: new URL(request.url),
		} as LoaderFunctionArgs),
	);
}

function loadMessages(userId: number, roomId: number) {
	const request = new Request(
		`http://app.com/api/chat/rooms/${roomId}/messages`,
	);

	return withUserId(userId, () =>
		messagesLoader({
			request,
			params: { id: String(roomId) },
			context: {} as any,
			pattern: "",
			url: new URL(request.url),
		} as LoaderFunctionArgs),
	);
}

async function statusOf(promise: Promise<unknown>) {
	try {
		await promise;
		return 200;
	} catch (thrown) {
		if (thrown instanceof Response) return thrown.status;
		throw thrown;
	}
}
