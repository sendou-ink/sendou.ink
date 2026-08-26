import type { ServerEvent } from "~/features/events/events-types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import {
	CHAT_ROOMS_DATA_ROUTE,
	chatRoomDataRoute,
	chatRoomMessagesRoute,
	chatRoomReadRoute,
} from "~/utils/urls";
import { eventsClient } from "../events/events-client";
import type {
	ChatMessageAuthor,
	ChatMessageWithAuthor,
	ChatRoomListItem,
	ClientChatMessage,
} from "./chat-types";

const READ_DEBOUNCE_MS = 1_500;

interface ChatClientDeps {
	fetchRooms: () => Promise<{ rooms: ChatRoomListItem[] } | null>;
	fetchRoom: (roomId: number) => Promise<{ room: ChatRoomListItem } | null>;
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

/** A known room, flagged when it is only observed: route-opened outside the user's own list (an observer on a match page), never unread, kept across list refetches. */
type TrackedRoom = ChatRoomListItem & { observed: boolean };

export interface ChatSnapshot {
	/** False until the first rooms fetch has landed. */
	roomsLoaded: boolean;
	/** The user's own rooms in list order; observed rooms are not among them. */
	rooms: ChatRoomListItem[];
	/** Every known room by id: the user's own plus the route-opened observed ones. */
	roomsById: ReadonlyMap<number, ChatRoomListItem>;
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
	/** Fetches a room's info as an observed room when the user's own room list does not carry it (observer access via a route's `chatRoomIds`). */
	ensureRoomKnown: (roomId: number) => void;
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
	let roomsById = new Map<number, TrackedRoom>();
	/** `roomsById` without the observed rooms, kept in sync by `replaceRooms`. */
	let listedRooms: ChatRoomListItem[] = [];
	let messagesByRoomId = new Map<number, ClientChatMessage[]>();
	let viewedRoomIds = new Set<number>();
	let snapshot: ChatSnapshot | null = null;

	const loadingObservedRoomIds = new Set<number>();

	let roomsRefreshInflight: Promise<void> | null = null;
	const loadingMessageRoomIds = new Set<number>();
	/** Unknown rooms a refetch was already tried for: messages of a room the user merely observes (moderation view) must not refetch the list over and over. */
	const refetchedUnknownRoomIds = new Set<number>();
	/** Newest message id already marked read locally per room, so refetches can't resurrect stale unread counts. */
	const locallyReadByRoomId = new Map<number, number>();
	const readTimers = new Map<number, ReturnType<typeof setTimeout>>();

	const notify = () => {
		snapshot = null;
		for (const listener of listeners) {
			listener();
		}
	};

	const roomById = (roomId: number) => roomsById.get(roomId);

	const replaceRooms = (next: Map<number, TrackedRoom>) => {
		roomsById = next;
		listedRooms = [...next.values()].filter((room) => !room.observed);
	};

	const setRoom = (roomId: number, patch: Partial<TrackedRoom>) => {
		const room = roomsById.get(roomId);
		if (!room) return;
		replaceRooms(new Map(roomsById).set(roomId, { ...room, ...patch }));
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
			if (roomsLoaded && !refetchedUnknownRoomIds.has(message.roomId)) {
				refetchedUnknownRoomIds.add(message.roomId);
				void refreshRooms();
			}
			return;
		}

		insertPersisted(message);

		const isOwn = message.authorUserId === ownUserId;
		const patch: Partial<TrackedRoom> = {
			latestMessageId: Math.max(room.latestMessageId ?? 0, message.id),
			latestMessageAt: Math.max(room.latestMessageAt ?? 0, message.createdAt),
		};
		// observed rooms never count unread — the observer opted in by viewing
		if (!room.observed && !isOwn && !viewedRoomIds.has(message.roomId)) {
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
		if (!room.observed && message.type !== null) {
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

				const next = new Map<number, TrackedRoom>();
				for (const room of data.rooms) {
					// a room that arrived in the list is no longer unknown; a later
					// recreation under the same owner may need a refetch again
					refetchedUnknownRoomIds.delete(room.id);

					// a locally-read room stays read even when the server response
					// raced the debounced read POST
					const readUpTo = locallyReadByRoomId.get(room.id) ?? 0;
					const locallyRead =
						room.latestMessageId !== null && readUpTo >= room.latestMessageId;

					next.set(room.id, {
						...room,
						unreadCount: locallyRead ? 0 : room.unreadCount,
						observed: false,
					});
				}

				// the list version wins over a held observed copy
				for (const [roomId, room] of roomsById) {
					if (room.observed && !next.has(roomId)) {
						next.set(roomId, room);
					}
				}

				replaceRooms(next);
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

	/** A held history whose room is no longer known belongs to a room the user lost access to (e.g. left the group); drop the local copy. */
	const pruneLostRooms = () => {
		const lostRoomIds = [...messagesByRoomId.keys()].filter(
			(roomId) => !roomsById.has(roomId),
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

	const loadObservedRoom = async (roomId: number) => {
		if (loadingObservedRoomIds.has(roomId)) return;
		loadingObservedRoomIds.add(roomId);

		try {
			const data = await deps.fetchRoom(roomId);
			const known = roomById(roomId);
			// the room may have entered the user's own list while the fetch was in flight
			if (!data || (known && !known.observed)) return;

			// an observed room never accrues unread, so it must not start out with the
			// server's count of everything said in it before the observer showed up
			replaceRooms(
				new Map(roomsById).set(roomId, {
					...data.room,
					unreadCount: 0,
					observed: true,
				}),
			);
			notify();
		} catch (error) {
			logger.error("Fetching chat room info failed", error);
		} finally {
			loadingObservedRoomIds.delete(roomId);
		}
	};

	const loadMessages = async (roomId: number) => {
		if (loadingMessageRoomIds.has(roomId)) return;
		loadingMessageRoomIds.add(roomId);
		// an entry from the start makes the history the one place messages pushed
		// mid-fetch land in
		if (!messagesByRoomId.has(roomId)) {
			setMessages(roomId, []);
		}

		try {
			const data = await deps.fetchMessages(roomId);
			if (!data) {
				dropEmptyHistory(roomId);
				return;
			}

			// keep everything appended while the fetch was in flight that its
			// snapshot predates: optimistic sends, and messages pushed over SSE
			const fetchedPublicIds = new Set(
				data.messages.map((message) => message.publicId),
			);
			const missedByFetch = (messagesByRoomId.get(roomId) ?? []).filter(
				(message) => !fetchedPublicIds.has(message.publicId),
			);
			setMessages(roomId, sortedMessages([...data.messages, ...missedByFetch]));
			notify();

			if (viewedRoomIds.has(roomId)) {
				markRead(roomId);
			}
		} catch (error) {
			logger.error("Fetching chat messages failed", error);
			dropEmptyHistory(roomId);
		} finally {
			loadingMessageRoomIds.delete(roomId);
		}
	};

	/** A failed fetch must not leave behind an empty history that reads as loaded. */
	const dropEmptyHistory = (roomId: number) => {
		if (messagesByRoomId.get(roomId)?.length !== 0) return;
		messagesByRoomId = new Map(messagesByRoomId);
		messagesByRoomId.delete(roomId);
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
			replaceRooms(new Map());
			messagesByRoomId = new Map();
			viewedRoomIds = new Set();
			locallyReadByRoomId.clear();
			loadingObservedRoomIds.clear();
			refetchedUnknownRoomIds.clear();
			notify();
		},
		getSnapshot: () => {
			snapshot ??= {
				roomsLoaded,
				rooms: listedRooms,
				roomsById,
				totalUnreadCount: listedRooms.reduce(
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
		ensureRoomKnown: (roomId) => {
			if (roomsById.has(roomId)) return;
			void loadObservedRoom(roomId);
		},
		ensureMessagesLoaded: (roomId) => {
			if (messagesByRoomId.has(roomId)) return;
			void loadMessages(roomId);
		},
		catchUp: () => {
			void refreshRooms();
			for (const [roomId, room] of roomsById) {
				if (room.observed) {
					void loadObservedRoom(roomId);
				}
			}
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
	fetchRoom: (roomId) => fetchJson(chatRoomDataRoute(roomId)),
	fetchMessages: (roomId) => fetchJson(chatRoomMessagesRoute(roomId)),
	postMessage: async (roomId, message) => {
		const response = await fetch(chatRoomMessagesRoute(roomId), {
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
		await fetch(chatRoomReadRoute(roomId), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lastSeenMessageId }),
		});
	},
	addServerEventListener: (listener) => eventsClient.addEventListener(listener),
});
