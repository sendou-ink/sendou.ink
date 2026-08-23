import type { ServerEvent } from "~/features/events/events-types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { eventsClient } from "../events/events-client";
import {
	CHAT_ROOMS_DATA_ROUTE,
	chatMarkReadRoute,
	chatRoomMessagesDataRoute,
	chatSendMessageRoute,
} from "./chat-constants";
import type {
	ChatMessageAuthor,
	ChatMessageWithAuthor,
	ChatRoomListItem,
	ClientChatMessage,
} from "./chat-types";

const READ_DEBOUNCE_MS = 1_500;

interface ChatClientDeps {
	fetchRooms: () => Promise<{ rooms: ChatRoomListItem[] } | null>;
	fetchMessages: (
		roomId: number,
	) => Promise<{ messages: ChatMessageWithAuthor[] } | null>;
	/** Plain fetch on purpose: a router fetcher submission would revalidate the page's loaders, which a chat send must never do. Null on failure. */
	postMessage: (
		roomId: number,
		message: { publicId: string; contents: string },
	) => Promise<{ message: ChatMessageWithAuthor } | null>;
	postRead: (roomId: number, lastSeenMessageId: number) => Promise<void>;
	addServerEventListener: (
		listener: (event: ServerEvent) => void,
	) => () => void;
	readDebounceMs?: number;
}

export interface ChatSnapshot {
	/** False until the first rooms fetch has landed. */
	roomsLoaded: boolean;
	rooms: ChatRoomListItem[];
	totalUnreadCount: number;
	/** Loaded histories, oldest first, optimistic pending sends last. Absent key = history not fetched yet. */
	messagesByRoomId: ReadonlyMap<number, ClientChatMessage[]>;
}

export interface ChatClient {
	/** Starts listening to server events and fetches the room list. */
	start: (ownUserId: number) => void;
	/** Stops event handling and resets all held data. */
	stop: () => void;
	getSnapshot: () => ChatSnapshot;
	/** Subscribes to snapshot changes, for `useSyncExternalStore`. Returns an unsubscribe function. */
	subscribe: (listener: () => void) => () => void;
	refreshRooms: () => Promise<void>;
	/** Fetches the room's history unless it is already loaded or loading. */
	ensureMessagesLoaded: (roomId: number) => void;
	/** Reconnect catch-up: refetches the room list and every loaded history. */
	catchUp: () => void;
	/** Appends an optimistic pending message and POSTs the send; the pending row is replaced by the SSE echo or the POST response (whichever lands first), and removed if the send fails. */
	send: (
		roomId: number,
		message: { publicId: string; contents: string; author: ChatMessageAuthor },
	) => void;
	/** Zeroes the room's unread count and debounces the read-indicator POST. */
	markRead: (roomId: number) => void;
	/** Rooms the user has on screen right now: incoming messages there are read immediately instead of counting unread. */
	setViewedRoomIds: (roomIds: number[]) => void;
}

export function createChatClient(deps: ChatClientDeps): ChatClient {
	const readDebounceMs = deps.readDebounceMs ?? READ_DEBOUNCE_MS;
	const listeners = new Set<() => void>();

	let ownUserId: number | null = null;
	let removeEventListener: (() => void) | null = null;
	let roomsLoaded = false;
	let rooms: ChatRoomListItem[] = [];
	let messagesByRoomId = new Map<number, ClientChatMessage[]>();
	let viewedRoomIds = new Set<number>();
	let snapshot: ChatSnapshot | null = null;

	let roomsRefreshInflight: Promise<void> | null = null;
	const loadingMessageRoomIds = new Set<number>();
	/** Newest message id already marked read locally per room, so refetches can't resurrect stale unread counts. */
	const locallyReadByRoomId = new Map<number, number>();
	const readTimers = new Map<number, ReturnType<typeof setTimeout>>();

	const notify = () => {
		snapshot = null;
		for (const listener of listeners) {
			listener();
		}
	};

	const roomById = (roomId: number) => rooms.find((room) => room.id === roomId);

	const setRoom = (roomId: number, patch: Partial<ChatRoomListItem>) => {
		rooms = rooms.map((room) =>
			room.id === roomId ? { ...room, ...patch } : room,
		);
	};

	const setMessages = (roomId: number, messages: ClientChatMessage[]) => {
		messagesByRoomId = new Map(messagesByRoomId);
		messagesByRoomId.set(roomId, messages);
	};

	/** Inserts a persisted message into a loaded history, replacing a pending send or older copy with the same `publicId`. */
	const insertPersisted = (message: ChatMessageWithAuthor) => {
		const existing = messagesByRoomId.get(message.roomId);
		if (!existing) return;

		const replaceIndex = existing.findIndex(
			(candidate) => candidate.publicId === message.publicId,
		);
		if (replaceIndex !== -1) {
			const updated = [...existing];
			updated[replaceIndex] = message;
			setMessages(message.roomId, sortedMessages(updated));
			return;
		}

		setMessages(message.roomId, sortedMessages([...existing, message]));
	};

	const flushRead = (roomId: number) => {
		const timer = readTimers.get(roomId);
		if (timer) {
			clearTimeout(timer);
			readTimers.delete(roomId);
		}

		const lastSeenMessageId = locallyReadByRoomId.get(roomId);
		if (!lastSeenMessageId) return;

		deps.postRead(roomId, lastSeenMessageId).catch((error) => {
			logger.error("Posting chat read indicator failed", error);
		});
	};

	const markRead = (roomId: number) => {
		const room = roomById(roomId);

		const latestLoadedId = messagesByRoomId
			.get(roomId)
			?.findLast((message) => !message.pending)?.id;
		const targetId = latestLoadedId ?? room?.latestMessageId ?? null;

		if (room && room.unreadCount !== 0) {
			setRoom(roomId, { unreadCount: 0 });
			notify();
		}

		if (targetId === null || (locallyReadByRoomId.get(roomId) ?? 0) >= targetId)
			return;

		locallyReadByRoomId.set(roomId, targetId);
		if (!readTimers.has(roomId)) {
			readTimers.set(
				roomId,
				setTimeout(() => flushRead(roomId), readDebounceMs),
			);
		}
	};

	const handleIncomingMessage = (message: ChatMessageWithAuthor) => {
		const room = roomById(message.roomId);
		if (!room) {
			// e.g. a first message right after a room was created; the refetched
			// list includes the new room and its unread count
			if (roomsLoaded) void refreshRooms();
			return;
		}

		insertPersisted(message);

		const isOwn = message.authorUserId === ownUserId;
		const patch: Partial<ChatRoomListItem> = {
			latestMessageId: Math.max(room.latestMessageId ?? 0, message.id),
			latestMessageAt: Math.max(room.latestMessageAt ?? 0, message.createdAt),
		};
		if (!isOwn && !viewedRoomIds.has(message.roomId)) {
			patch.unreadCount = room.unreadCount + 1;
		}
		setRoom(message.roomId, patch);
		notify();

		if (viewedRoomIds.has(message.roomId)) {
			markRead(message.roomId);
		}

		// a system message accompanies an owner state change (a confirmed score
		// concludes the match, a leaver shrinks the roster) — refetch so inactive
		// flags and titles track it
		if (message.type !== null) {
			void refreshRooms();
		}
	};

	const handleEvent = (event: ServerEvent) => {
		if (event.kind === "chatMessage") {
			handleIncomingMessage(event.message);
		} else if (event.kind === "roomsChanged") {
			void refreshRooms();
		}
	};

	const refreshRooms = () => {
		if (roomsRefreshInflight) return roomsRefreshInflight;

		roomsRefreshInflight = (async () => {
			try {
				const data = await deps.fetchRooms();
				if (!data) return;

				rooms = data.rooms.map((room) => {
					const readUpTo = locallyReadByRoomId.get(room.id) ?? 0;
					// a locally-read room stays read even when the server response
					// raced the debounced read POST
					if (
						room.unreadCount > 0 &&
						room.latestMessageId !== null &&
						readUpTo >= room.latestMessageId
					) {
						return { ...room, unreadCount: 0 };
					}
					return room;
				});
				pruneLostRooms();
				roomsLoaded = true;
				notify();
			} catch (error) {
				logger.error("Fetching chat rooms failed", error);
			} finally {
				roomsRefreshInflight = null;
			}
		})();

		return roomsRefreshInflight;
	};

	/** A held history whose room is no longer in the list belongs to a room the user lost access to (e.g. left the group); drop the local copy. */
	const pruneLostRooms = () => {
		const keptRoomIds = new Set(rooms.map((room) => room.id));
		const lostRoomIds = [...messagesByRoomId.keys()].filter(
			(roomId) => !keptRoomIds.has(roomId),
		);
		if (lostRoomIds.length === 0) return;

		messagesByRoomId = new Map(messagesByRoomId);
		for (const roomId of lostRoomIds) {
			messagesByRoomId.delete(roomId);
			locallyReadByRoomId.delete(roomId);
			const timer = readTimers.get(roomId);
			if (timer) {
				clearTimeout(timer);
				readTimers.delete(roomId);
			}
		}
	};

	const loadMessages = async (roomId: number) => {
		if (loadingMessageRoomIds.has(roomId)) return;
		loadingMessageRoomIds.add(roomId);

		try {
			const data = await deps.fetchMessages(roomId);
			if (!data) return;

			// keep optimistic sends that were appended while the fetch was in flight
			const pending = (messagesByRoomId.get(roomId) ?? []).filter(
				(message) =>
					message.pending &&
					!data.messages.some(
						(fetched) => fetched.publicId === message.publicId,
					),
			);
			setMessages(roomId, [...data.messages, ...pending]);
			notify();

			if (viewedRoomIds.has(roomId)) {
				markRead(roomId);
			}
		} catch (error) {
			logger.error("Fetching chat messages failed", error);
		} finally {
			loadingMessageRoomIds.delete(roomId);
		}
	};

	return {
		start: (userId) => {
			if (removeEventListener) return;

			ownUserId = userId;
			removeEventListener = deps.addServerEventListener(handleEvent);
			void refreshRooms();
		},
		stop: () => {
			removeEventListener?.();
			removeEventListener = null;
			for (const roomId of readTimers.keys()) {
				flushRead(roomId);
			}
			ownUserId = null;
			roomsLoaded = false;
			rooms = [];
			messagesByRoomId = new Map();
			viewedRoomIds = new Set();
			locallyReadByRoomId.clear();
			notify();
		},
		getSnapshot: () => {
			snapshot ??= {
				roomsLoaded,
				rooms,
				totalUnreadCount: rooms.reduce(
					(sum, room) => sum + room.unreadCount,
					0,
				),
				messagesByRoomId,
			};
			return snapshot;
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		refreshRooms,
		ensureMessagesLoaded: (roomId) => {
			if (messagesByRoomId.has(roomId)) return;
			void loadMessages(roomId);
		},
		catchUp: () => {
			void refreshRooms();
			for (const roomId of messagesByRoomId.keys()) {
				void loadMessages(roomId);
			}
		},
		send: (roomId, { publicId, contents, author }) => {
			const existing = messagesByRoomId.get(roomId) ?? [];
			setMessages(roomId, [
				...existing,
				{
					id: 0,
					roomId,
					authorUserId: author.id,
					type: null,
					contents,
					publicId,
					createdAt: dateToDatabaseTimestamp(new Date()),
					author,
					pending: true,
				},
			]);
			notify();

			void deps
				.postMessage(roomId, { publicId, contents })
				.catch((error) => {
					logger.error("Sending chat message failed", error);
					return null;
				})
				.then((data) => {
					if (data) {
						// usually the SSE echo lands first; both reconcile by publicId
						insertPersisted(data.message);
						const room = roomById(roomId);
						if (room) {
							setRoom(roomId, {
								latestMessageId: Math.max(
									room.latestMessageId ?? 0,
									data.message.id,
								),
								latestMessageAt: Math.max(
									room.latestMessageAt ?? 0,
									data.message.createdAt,
								),
							});
						}
						notify();
						return;
					}

					// a failed send stuck at pending forever would read as delivered
					const messages = messagesByRoomId.get(roomId);
					if (!messages) return;
					const withoutFailed = messages.filter(
						(message) => !(message.pending && message.publicId === publicId),
					);
					if (withoutFailed.length !== messages.length) {
						setMessages(roomId, withoutFailed);
						notify();
					}
				});
		},
		markRead,
		setViewedRoomIds: (roomIds) => {
			const previous = viewedRoomIds;
			viewedRoomIds = new Set(roomIds);
			for (const roomId of viewedRoomIds) {
				if (!previous.has(roomId)) {
					markRead(roomId);
				}
			}
		},
	};
}

/** Persisted messages by id ascending, optimistic pending sends after them in send order. */
function sortedMessages(messages: ClientChatMessage[]): ClientChatMessage[] {
	const persisted = messages.filter((message) => !message.pending);
	const pending = messages.filter((message) => message.pending);
	persisted.sort((a, b) => a.id - b.id);
	return [...persisted, ...pending];
}

const fetchJson = async <T>(url: string): Promise<T | null> => {
	const response = await fetch(url);
	if (!response.ok) {
		logger.error(`Chat fetch failed (${response.status}): ${url}`);
		return null;
	}
	return (await response.json()) as T;
};

export const chatClient = createChatClient({
	fetchRooms: () => fetchJson(CHAT_ROOMS_DATA_ROUTE),
	fetchMessages: (roomId) => fetchJson(chatRoomMessagesDataRoute(roomId)),
	postMessage: async (roomId, message) => {
		const response = await fetch(chatSendMessageRoute(roomId), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(message),
		});
		if (!response.ok) {
			logger.error(`Sending chat message failed (${response.status})`);
			return null;
		}

		const data = (await response.json()) as {
			message?: ChatMessageWithAuthor;
		};
		return data.message ? { message: data.message } : null;
	},
	postRead: async (roomId, lastSeenMessageId) => {
		await fetch(chatMarkReadRoute(roomId), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lastSeenMessageId }),
		});
	},
	addServerEventListener: (listener) => eventsClient.addEventListener(listener),
});
