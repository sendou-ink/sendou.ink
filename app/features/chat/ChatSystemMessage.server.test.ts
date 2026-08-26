import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { chatRoomChannel, userChannel } from "~/features/events/events-types";
import {
	abortSubscriptions,
	flushEvents,
	subscribeTo,
} from "~/features/events/tests/fixtures";
import * as ChatRepository from "./ChatRepository.server";
import * as ChatSystemMessage from "./ChatSystemMessage.server";
import { setupSqMatch } from "./tests/fixtures";

const users = UserFactory.pool();

beforeEach(async () => {
	await users.create(9);
});

afterEach(() => {
	abortSubscriptions();
});

describe("ChatSystemMessage.send", () => {
	test("publishes a revalidate broadcast to its topic channel", async () => {
		const received = subscribeTo("tournament__101");

		ChatSystemMessage.send({
			channel: "tournament__101",
			revalidateScope: "MATCH_RESULTS",
			authorUserId: 5,
		});
		await flushEvents();

		expect(received).toEqual([
			{ kind: "revalidate", scope: "MATCH_RESULTS", authorUserId: 5 },
		]);
	});

	test("keeps a sound-carrying type on the broadcast, bypassing the throttle", async () => {
		const received = subscribeTo("sq-group__102");

		ChatSystemMessage.send({
			channel: "sq-group__102",
			type: "READY_CHECK_STARTED",
			authorUserId: 5,
		});
		ChatSystemMessage.send({
			channel: "sq-group__102",
			type: "READY_CHECK_STARTED",
			authorUserId: 5,
		});
		await flushEvents();

		expect(received).toEqual([
			{ kind: "revalidate", authorUserId: 5, type: "READY_CHECK_STARTED" },
			{ kind: "revalidate", authorUserId: 5, type: "READY_CHECK_STARTED" },
		]);
	});

	test("throttles rapid soundless broadcasts to the same topic", async () => {
		const received = subscribeTo("tournament__104");

		ChatSystemMessage.send({
			channel: "tournament__104",
		});
		ChatSystemMessage.send({
			channel: "tournament__104",
		});
		await flushEvents();

		expect(received).toHaveLength(1);
	});
});

describe("ChatSystemMessage.sendPersisted", () => {
	test("persists the message as a chat line of the room", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		await ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId!,
			type: "SCORE_CONFIRMED",
			authorUserId: alphaUserIds[0],
		});

		const messages = await ChatRepository.findAllMessagesByRoomId(
			match.chatRoomId!,
		);
		expect(messages).toHaveLength(1);
		expect(messages[0].type).toBe("SCORE_CONFIRMED");
		expect(messages[0].authorUserId).toBe(alphaUserIds[0]);
		expect(messages[0].contents).toBeNull();
	});

	test("publishes the message to participant user channels and the room channel", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		const bravoReceived = subscribeTo(userChannel(bravoUserIds[0]));
		const roomReceived = subscribeTo(chatRoomChannel(match.chatRoomId!));

		await ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId!,
			type: "CANCEL_REPORTED",
			authorUserId: alphaUserIds[0],
		});
		await flushEvents();

		expect(bravoReceived).toEqual([
			expect.objectContaining({
				kind: "chatMessage",
				roomId: match.chatRoomId,
				message: expect.objectContaining({ type: "CANCEL_REPORTED" }),
			}),
		]);
		expect(roomReceived[0]).toEqual(
			expect.objectContaining({ kind: "chatMessage" }),
		);
	});

	test("publishes a revalidate broadcast to the room channel so subscribed pages refetch", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		const roomReceived = subscribeTo(chatRoomChannel(match.chatRoomId!));

		await ChatSystemMessage.sendPersisted({
			roomId: match.chatRoomId!,
			type: "CANCEL_CONFIRMED",
			authorUserId: alphaUserIds[0],
		});
		await flushEvents();

		expect(roomReceived).toEqual([
			expect.objectContaining({ kind: "chatMessage" }),
			{ kind: "revalidate" },
		]);
	});

	test("does nothing for a room that no longer resolves", async () => {
		const received = subscribeTo(chatRoomChannel(9999));

		await ChatSystemMessage.sendPersisted({
			roomId: 9999,
			type: "USER_LEFT",
			authorUserId: users.id(2),
		});
		await flushEvents();

		expect(received).toEqual([]);
	});
});

describe("ChatSystemMessage.notifyNotificationsChanged", () => {
	test("publishes to each user's channel", async () => {
		const alpha = subscribeTo(userChannel(1));
		const bravo = subscribeTo(userChannel(2));

		ChatSystemMessage.notifyNotificationsChanged([1, 2]);
		await flushEvents();

		expect(alpha).toEqual([{ kind: "notificationsChanged" }]);
		expect(bravo).toEqual([{ kind: "notificationsChanged" }]);
	});
});

describe("ChatSystemMessage.notifyRoomsChanged", () => {
	test("publishes to each user's channel", async () => {
		const alpha = subscribeTo(userChannel(1));
		const bravo = subscribeTo(userChannel(2));

		ChatSystemMessage.notifyRoomsChanged([1, 2]);
		await flushEvents();

		expect(alpha).toEqual([{ kind: "roomsChanged" }]);
		expect(bravo).toEqual([{ kind: "roomsChanged" }]);
	});
});

describe("ChatSystemMessage.notifyRoomsChangedByRoomIds", () => {
	test("publishes to the channel of every participant of the rooms", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);
		const alpha = subscribeTo(userChannel(alphaUserIds[0]));
		const bravo = subscribeTo(userChannel(bravoUserIds[0]));

		await ChatSystemMessage.notifyRoomsChangedByRoomIds([match.chatRoomId!]);
		await flushEvents();

		expect(alpha).toEqual([{ kind: "roomsChanged" }]);
		expect(bravo).toEqual([{ kind: "roomsChanged" }]);
	});

	test("publishes nothing for a room that no longer resolves", async () => {
		const received = subscribeTo(userChannel(users.id(2)));

		await ChatSystemMessage.notifyRoomsChangedByRoomIds([9999]);
		await flushEvents();

		expect(received).toEqual([]);
	});
});
