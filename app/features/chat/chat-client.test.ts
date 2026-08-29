import { describe, expect, test, vi } from "vitest";
import type { ServerEvent } from "~/features/events/events-types";
import { type ChatClient, createChatClient } from "./chat-client";
import type {
	ChatMessageAuthor,
	ChatMessageWithAuthor,
	ChatRoomListItem,
} from "./chat-types";

const READ_DEBOUNCE_MS = 20;

const author = (id: number): ChatMessageAuthor => ({
	id,
	username: `user-${id}`,
	discordId: String(id),
	discordAvatar: null,
	customUrl: null,
	customAvatarUrl: null,
	pronouns: null,
	chatNameHue: null,
});

function room(overrides: Partial<ChatRoomListItem> = {}): ChatRoomListItem {
	return {
		id: 1,
		type: "SQ_MATCH",
		titleParams: { matchId: "17" },
		url: "/q/match/17",
		imageUrl: null,
		participantUserIds: [1, 2],
		labelByUserId: {},
		expiresAt: 2_000_000_000,
		inactive: false,
		canPost: true,
		unreadCount: 0,
		latestMessageId: null,
		latestMessageAt: null,
		...overrides,
	};
}

function message(
	overrides: Partial<ChatMessageWithAuthor> = {},
): ChatMessageWithAuthor {
	const authorUserId = overrides.authorUserId ?? 2;
	return {
		id: 1,
		roomId: 1,
		authorUserId,
		type: null,
		contents: "hello",
		publicId: `public-${overrides.id ?? 1}`,
		createdAt: 1_700_000_000,
		author: authorUserId === null ? null : author(authorUserId),
		...overrides,
	};
}

function createHarness({
	rooms = [room()],
	messages = [] as ChatMessageWithAuthor[],
	observedRoom = null as ChatRoomListItem | null,
	// in-flight forever by default; tests exercising the response path override it
	postMessage = vi.fn(
		() => new Promise<{ message: ChatMessageWithAuthor } | null>(() => {}),
	),
} = {}) {
	let eventListener: ((event: ServerEvent) => void) | null = null;

	const fetchRooms = vi.fn(async () => ({ rooms }));
	const fetchRoom = vi.fn(async (roomId: number) =>
		observedRoom && observedRoom.id === roomId ? { room: observedRoom } : null,
	);
	const fetchMessages = vi.fn(
		async (
			_roomId: number,
		): Promise<{ messages: ChatMessageWithAuthor[] } | null> => ({ messages }),
	);
	const postRead = vi.fn(async () => {});
	const onSendFailed = vi.fn();

	const client = createChatClient({
		fetchRooms,
		fetchRoom,
		fetchMessages,
		postMessage,
		postRead,
		onSendFailed,
		addServerEventListener: (listener) => {
			eventListener = listener;
			return () => {
				eventListener = null;
			};
		},
		readDebounceMs: READ_DEBOUNCE_MS,
	});

	return {
		client,
		fetchRooms,
		fetchRoom,
		fetchMessages,
		postMessage,
		postRead,
		onSendFailed,
		emit: (event: ServerEvent) => eventListener?.(event),
		isListening: () => eventListener !== null,
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve));
const flushReadDebounce = () =>
	new Promise((resolve) => setTimeout(resolve, READ_DEBOUNCE_MS + 10));

async function startedClient(harness: { client: ChatClient }) {
	harness.client.start(1);
	await flush();
	return harness.client;
}

describe("createChatClient", () => {
	test("start fetches the room list and exposes total unread", async () => {
		const harness = createHarness({
			rooms: [room({ id: 1, unreadCount: 2 }), room({ id: 2, unreadCount: 1 })],
		});
		const client = await startedClient(harness);

		const snapshot = client.getSnapshot();
		expect(snapshot.roomsLoaded).toBe(true);
		expect(snapshot.rooms).toHaveLength(2);
		expect(snapshot.totalUnreadCount).toBe(3);
	});

	test("ensureMessagesLoaded fetches a room's history once", async () => {
		const harness = createHarness({
			messages: [message({ id: 1 }), message({ id: 2 })],
		});
		const client = await startedClient(harness);

		client.ensureMessagesLoaded(1);
		await flush();
		client.ensureMessagesLoaded(1);
		await flush();

		expect(harness.fetchMessages).toHaveBeenCalledTimes(1);
		expect(client.getSnapshot().messagesByRoomId.get(1)).toHaveLength(2);
	});

	test("an incoming message appends to the loaded history and bumps the room's unread count", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		const incoming = message({ id: 5, authorUserId: 2 });
		harness.emit({ kind: "chatMessage", roomId: 1, message: incoming });

		const snapshot = client.getSnapshot();
		expect(snapshot.messagesByRoomId.get(1)).toEqual([incoming]);
		expect(snapshot.rooms[0]).toMatchObject({
			unreadCount: 1,
			latestMessageId: 5,
		});
	});

	test("an incoming message to a room with unloaded history only bumps the unread count", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);

		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 5 }),
		});

		const snapshot = client.getSnapshot();
		expect(snapshot.messagesByRoomId.has(1)).toBe(false);
		expect(snapshot.totalUnreadCount).toBe(1);
	});

	test("a message pushed while the history fetch is in flight survives it landing", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);

		const history = [message({ id: 1 })];
		let landFetch = () => {};
		harness.fetchMessages.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					landFetch = () => resolve({ messages: history });
				}),
		);

		client.ensureMessagesLoaded(1);
		await flush();

		const incoming = message({ id: 5, authorUserId: 2 });
		harness.emit({ kind: "chatMessage", roomId: 1, message: incoming });

		landFetch();
		await flush();

		expect(client.getSnapshot().messagesByRoomId.get(1)).toEqual([
			...history,
			incoming,
		]);
	});

	test("a failed history fetch leaves the room retryable", async () => {
		const harness = createHarness({ messages: [message({ id: 1 })] });
		const client = await startedClient(harness);

		harness.fetchMessages.mockResolvedValueOnce(null);

		client.ensureMessagesLoaded(1);
		await flush();
		expect(client.getSnapshot().messagesByRoomId.has(1)).toBe(false);

		client.ensureMessagesLoaded(1);
		await flush();

		expect(harness.fetchMessages).toHaveBeenCalledTimes(2);
		expect(client.getSnapshot().messagesByRoomId.get(1)).toHaveLength(1);
	});

	test("the user's own message from another device never counts as unread", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);

		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 5, authorUserId: 1 }),
		});

		expect(client.getSnapshot().totalUnreadCount).toBe(0);
	});

	test("a message to a viewed room is read immediately instead of counting unread", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();
		client.setViewedRoomIds([1]);

		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 5 }),
		});

		expect(client.getSnapshot().totalUnreadCount).toBe(0);
		await flushReadDebounce();
		expect(harness.postRead).toHaveBeenCalledWith(1, 5);
	});

	test("the echo replaces the optimistic pending send with the same publicId", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		client.send(1, {
			publicId: "abcdefghij",
			contents: "hi there",
			author: author(1),
		});
		expect(client.getSnapshot().messagesByRoomId.get(1)).toMatchObject([
			{ publicId: "abcdefghij", pending: true },
		]);

		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 7, authorUserId: 1, publicId: "abcdefghij" }),
		});

		const messages = client.getSnapshot().messagesByRoomId.get(1)!;
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({ id: 7, publicId: "abcdefghij" });
		expect(messages[0].pending).toBeUndefined();
	});

	test("the POST response reconciles the pending send when the echo is delayed", async () => {
		const sent = message({ id: 7, authorUserId: 1, publicId: "abcdefghij" });
		const harness = createHarness({
			postMessage: vi.fn(async () => ({ message: sent })),
		});
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		client.send(1, {
			publicId: "abcdefghij",
			contents: "hi there",
			author: author(1),
		});
		await flush();

		expect(harness.postMessage).toHaveBeenCalledWith(1, {
			publicId: "abcdefghij",
			contents: "hi there",
		});
		const messages = client.getSnapshot().messagesByRoomId.get(1)!;
		expect(messages).toMatchObject([{ id: 7, publicId: "abcdefghij" }]);
		expect(messages[0].pending).toBeUndefined();
		expect(client.getSnapshot().rooms[0].latestMessageId).toBe(7);
	});

	test("a failed send's pending message is removed", async () => {
		const harness = createHarness({
			postMessage: vi.fn(async () => null),
		});
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		client.send(1, {
			publicId: "abcdefghij",
			contents: "hi there",
			author: author(1),
		});
		expect(client.getSnapshot().messagesByRoomId.get(1)).toHaveLength(1);
		await flush();

		expect(client.getSnapshot().messagesByRoomId.get(1)).toHaveLength(0);
		expect(harness.onSendFailed).toHaveBeenCalledTimes(1);
	});

	test("a send whose POST throws is removed like a failed one", async () => {
		const harness = createHarness({
			postMessage: vi.fn(async () => {
				throw new Error("network down");
			}),
		});
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		client.send(1, {
			publicId: "abcdefghij",
			contents: "hi there",
			author: author(1),
		});
		await flush();

		expect(client.getSnapshot().messagesByRoomId.get(1)).toHaveLength(0);
		expect(harness.onSendFailed).toHaveBeenCalledTimes(1);
	});

	test("optimistic sends appended while the history fetch is in flight are kept", async () => {
		const harness = createHarness({ messages: [message({ id: 1 })] });
		const client = await startedClient(harness);

		client.ensureMessagesLoaded(1);
		client.send(1, {
			publicId: "abcdefghij",
			contents: "raced",
			author: author(1),
		});
		await flush();

		expect(client.getSnapshot().messagesByRoomId.get(1)).toMatchObject([
			{ id: 1 },
			{ publicId: "abcdefghij", pending: true },
		]);
	});

	test("a message for an unknown room refetches the room list", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		expect(harness.fetchRooms).toHaveBeenCalledTimes(1);

		harness.emit({
			kind: "chatMessage",
			roomId: 999,
			message: message({ id: 5, roomId: 999 }),
		});
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(2);
		expect(client.getSnapshot().roomsLoaded).toBe(true);
	});

	test("a message arriving mid-refetch survives the refetch's older snapshot", async () => {
		const harness = createHarness({
			rooms: [room({ id: 1, latestMessageId: 10 })],
		});
		const client = await startedClient(harness);

		let landRefetch = () => {};
		harness.fetchRooms.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					landRefetch = () =>
						resolve({ rooms: [room({ id: 1, latestMessageId: 10 })] });
				}),
		);

		harness.emit({ kind: "roomsChanged" });
		await flush();
		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 11 }),
		});
		await flush();
		landRefetch();
		await flush();

		expect(client.getSnapshot().totalUnreadCount).toBe(1);
	});

	test("a refetch asked for while one is in flight fetches again after it", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);

		let landRefetch = () => {};
		harness.fetchRooms.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					landRefetch = () => resolve({ rooms: [room()] });
				}),
		);

		void client.refreshRooms();
		void client.refreshRooms();
		landRefetch();
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(3);
	});

	test("a message arriving before the first rooms fetch lands brings its room in", async () => {
		const harness = createHarness({ rooms: [] });
		let landFirstFetch = () => {};
		harness.fetchRooms.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					landFirstFetch = () => resolve({ rooms: [] });
				}),
		);

		harness.client.start(1);
		await flush();
		harness.emit({
			kind: "chatMessage",
			roomId: 2,
			message: message({ id: 5, roomId: 2 }),
		});
		await flush();

		harness.fetchRooms.mockResolvedValue({
			rooms: [room({ id: 2, unreadCount: 1, latestMessageId: 5 })],
		});
		landFirstFetch();
		await flush();

		expect(harness.client.getSnapshot().totalUnreadCount).toBe(1);
	});

	test("further messages for a room that stayed unknown after the refetch do not refetch again", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);

		// an observed room (moderation view) is never in the user's room list
		harness.emit({
			kind: "chatMessage",
			roomId: 999,
			message: message({ id: 5, roomId: 999 }),
		});
		await flush();
		harness.emit({
			kind: "chatMessage",
			roomId: 999,
			message: message({ id: 6, roomId: 999 }),
		});
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(2);
		expect(client.getSnapshot().rooms).toHaveLength(1);
	});

	test("a room that arrived in the list refetches again if it later goes unknown", async () => {
		const harness = createHarness();
		await startedClient(harness);

		harness.emit({
			kind: "chatMessage",
			roomId: 2,
			message: message({ id: 5, roomId: 2 }),
		});
		await flush();
		expect(harness.fetchRooms).toHaveBeenCalledTimes(2);

		// the refetch now knows the room...
		harness.fetchRooms.mockResolvedValue({ rooms: [room({ id: 2 })] });
		harness.emit({ kind: "roomsChanged" });
		await flush();

		// ...and once it drops out again, a message for it refetches once more
		harness.fetchRooms.mockResolvedValue({ rooms: [room({ id: 1 })] });
		harness.emit({ kind: "roomsChanged" });
		await flush();
		harness.emit({
			kind: "chatMessage",
			roomId: 2,
			message: message({ id: 6, roomId: 2 }),
		});
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(5);
	});

	test("ensureRoomKnown fetches an observed room outside the user's list", async () => {
		const observed = room({ id: 50, url: "/to/2/matches/2" });
		const harness = createHarness({ observedRoom: observed });
		const client = await startedClient(harness);

		client.ensureRoomKnown(50);
		await flush();
		client.ensureRoomKnown(50);
		await flush();

		expect(harness.fetchRoom).toHaveBeenCalledTimes(1);
		expect(client.getSnapshot().roomsById.get(50)).toMatchObject({ id: 50 });
		expect(client.getSnapshot().rooms).toHaveLength(1);
		expect([...client.getSnapshot().observedRoomIds]).toEqual([50]);
	});

	test("an observed room starts with no unread of its own", async () => {
		const observed = room({ id: 50, unreadCount: 12 });
		const harness = createHarness({ observedRoom: observed });
		const client = await startedClient(harness);

		client.ensureRoomKnown(50);
		await flush();

		expect(client.getSnapshot().roomsById.get(50)?.unreadCount).toBe(0);
		expect(client.getSnapshot().totalUnreadCount).toBe(0);
	});

	test("ensureRoomKnown is a no-op for a room already in the user's list", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);

		client.ensureRoomKnown(1);
		await flush();

		expect(harness.fetchRoom).not.toHaveBeenCalled();
	});

	test("a message to an observed room appends without counting unread or refetching the list", async () => {
		const observed = room({ id: 50 });
		const harness = createHarness({ observedRoom: observed });
		const client = await startedClient(harness);
		client.ensureRoomKnown(50);
		await flush();
		client.ensureMessagesLoaded(50);
		await flush();

		harness.emit({
			kind: "chatMessage",
			roomId: 50,
			message: message({ id: 5, roomId: 50 }),
		});
		await flush();

		expect(client.getSnapshot().messagesByRoomId.get(50)).toHaveLength(1);
		expect(client.getSnapshot().totalUnreadCount).toBe(0);
		expect(client.getSnapshot().roomsById.get(50)?.latestMessageId).toBe(5);
		expect(harness.fetchRooms).toHaveBeenCalledTimes(1);
	});

	test("a rooms refetch keeps the held history of an observed room", async () => {
		const observed = room({ id: 50 });
		const harness = createHarness({
			observedRoom: observed,
			messages: [message({ id: 1, roomId: 50 })],
		});
		const client = await startedClient(harness);
		client.ensureRoomKnown(50);
		await flush();
		client.ensureMessagesLoaded(50);
		await flush();

		harness.emit({ kind: "roomsChanged" });
		await flush();

		expect(client.getSnapshot().messagesByRoomId.has(50)).toBe(true);
	});

	test("reopening an observed room refetches its history", async () => {
		const observed = room({ id: 50 });
		const harness = createHarness({
			observedRoom: observed,
			messages: [message({ id: 1, roomId: 50 })],
		});
		const client = await startedClient(harness);
		client.ensureRoomKnown(50);
		await flush();
		client.ensureMessagesLoaded(50);
		await flush();

		harness.fetchMessages.mockResolvedValue({
			messages: [
				message({ id: 1, roomId: 50 }),
				message({ id: 2, roomId: 50 }),
			],
		});
		client.ensureMessagesLoaded(50);
		await flush();

		// nothing was pushed to the observer while the room's page was not open
		expect(harness.fetchMessages).toHaveBeenCalledTimes(2);
		expect(client.getSnapshot().messagesByRoomId.get(50)).toHaveLength(2);
	});

	test("an observed room the user's list later carries is superseded by the list version", async () => {
		const observed = room({ id: 50 });
		const harness = createHarness({ observedRoom: observed });
		const client = await startedClient(harness);
		client.ensureRoomKnown(50);
		await flush();
		expect(client.getSnapshot().rooms).toHaveLength(1);

		harness.fetchRooms.mockResolvedValue({
			rooms: [room({ id: 1 }), room({ id: 50, unreadCount: 3 })],
		});
		harness.emit({ kind: "roomsChanged" });
		await flush();

		expect(client.getSnapshot().rooms.map((each) => each.id)).toEqual([1, 50]);
		expect(client.getSnapshot().totalUnreadCount).toBe(3);
		expect(client.getSnapshot().observedRoomIds.size).toBe(0);
	});

	test("a roomsChanged event refetches the room list", async () => {
		const harness = createHarness();
		await startedClient(harness);

		harness.emit({ kind: "roomsChanged" });
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(2);
	});

	test("a system message triggers a room list refetch, tracking the owner state change it accompanies", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();
		expect(harness.fetchRooms).toHaveBeenCalledTimes(1);

		harness.fetchRooms.mockResolvedValue({
			rooms: [room({ inactive: true })],
		});
		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 5, type: "SCORE_CONFIRMED", contents: null }),
		});
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(2);
		expect(client.getSnapshot().rooms[0].inactive).toBe(true);
	});

	test("a rooms refetch drops the held history of a room the user lost access to", async () => {
		const harness = createHarness({
			messages: [message({ id: 1 })],
		});
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();
		expect(client.getSnapshot().messagesByRoomId.has(1)).toBe(true);

		harness.fetchRooms.mockResolvedValue({ rooms: [] });
		harness.emit({ kind: "roomsChanged" });
		await flush();

		expect(client.getSnapshot().rooms).toEqual([]);
		expect(client.getSnapshot().messagesByRoomId.has(1)).toBe(false);
	});

	test("markRead zeroes the unread count and debounces a single read POST for the newest message", async () => {
		const harness = createHarness({
			rooms: [room({ unreadCount: 2, latestMessageId: 8, latestMessageAt: 1 })],
		});
		const client = await startedClient(harness);

		client.markRead(1);
		client.markRead(1);
		expect(client.getSnapshot().totalUnreadCount).toBe(0);

		await flushReadDebounce();
		expect(harness.postRead).toHaveBeenCalledTimes(1);
		expect(harness.postRead).toHaveBeenCalledWith(1, 8);
	});

	test("flushReads posts the debounced read indicators right away", async () => {
		const harness = createHarness({
			rooms: [room({ unreadCount: 2, latestMessageId: 8, latestMessageAt: 1 })],
		});
		const client = await startedClient(harness);

		client.markRead(1);
		client.flushReads();

		expect(harness.postRead).toHaveBeenCalledWith(1, 8);

		// the debounce it flushed has nothing left to post
		await flushReadDebounce();
		expect(harness.postRead).toHaveBeenCalledTimes(1);
	});

	test("a rooms refetch cannot resurrect the unread count of a locally read room", async () => {
		const harness = createHarness({
			rooms: [room({ unreadCount: 2, latestMessageId: 8, latestMessageAt: 1 })],
		});
		const client = await startedClient(harness);

		client.markRead(1);
		await client.refreshRooms();

		expect(client.getSnapshot().totalUnreadCount).toBe(0);
	});

	test("catchUp refetches the room list and every loaded history", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		client.catchUp();
		await flush();

		expect(harness.fetchRooms).toHaveBeenCalledTimes(2);
		expect(harness.fetchMessages).toHaveBeenCalledTimes(2);
	});

	test("stop resets held data and stops listening to events", async () => {
		const harness = createHarness({ rooms: [room({ unreadCount: 1 })] });
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		client.stop();

		const snapshot = client.getSnapshot();
		expect(snapshot.roomsLoaded).toBe(false);
		expect(snapshot.rooms).toEqual([]);
		expect(snapshot.messagesByRoomId.size).toBe(0);
		expect(harness.isListening()).toBe(false);
	});

	test("persisted messages stay ordered by id when echoes arrive out of order", async () => {
		const harness = createHarness();
		const client = await startedClient(harness);
		client.ensureMessagesLoaded(1);
		await flush();

		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 5 }),
		});
		harness.emit({
			kind: "chatMessage",
			roomId: 1,
			message: message({ id: 3 }),
		});

		expect(
			client
				.getSnapshot()
				.messagesByRoomId.get(1)
				?.map((m) => m.id),
		).toEqual([3, 5]);
	});
});
