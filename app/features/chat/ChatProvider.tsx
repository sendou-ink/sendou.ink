import { nanoid } from "nanoid";
import { WebSocket } from "partysocket";
import * as React from "react";
import {
	useFetcher,
	useLocation,
	useMatches,
	useRevalidator,
} from "react-router";
import { logger } from "~/utils/logger";
import { soundPath } from "~/utils/urls";
import type {
	RoomInfo,
	RoomMetadata,
	ServerRoomInfo,
} from "./chat-provider-types";
import type { ChatMessage, ChatUser } from "./chat-types";
import { messageTypeToSound, soundEnabled, soundVolume } from "./chat-utils";
import { ChatContext } from "./useChatContext";

const PING_INTERVAL_MS = 60_000;
const LOCAL_STORAGE_PREFIX = "chat_read__";

function flattenServerRoom(serverRoom: ServerRoomInfo): RoomInfo {
	return {
		chatCode: serverRoom.chatCode,
		header: serverRoom.metadata.header,
		subtitle: serverRoom.metadata.subtitle ?? "",
		url: serverRoom.metadata.url ?? "",
		participantUserIds: serverRoom.metadata.participantUserIds,
		expiresAt: serverRoom.metadata.expiresAt,
		lastMessageTimestamp: serverRoom.lastMessageTimestamp ?? 0,
		totalMessageCount: serverRoom.totalMessageCount,
	};
}

function localStorageKey(chatCode: string) {
	return `${LOCAL_STORAGE_PREFIX}${chatCode}`;
}

function readLastReadCount(chatCode: string): number {
	try {
		const stored = localStorage.getItem(localStorageKey(chatCode));
		return stored ? Number(stored) : 0;
	} catch {
		return 0;
	}
}

function writeLastReadCount(chatCode: string, count: number) {
	try {
		localStorage.setItem(localStorageKey(chatCode), String(count));
	} catch {
		// localStorage may be unavailable
	}
}

export function ChatProvider({
	user,
	children,
}: {
	user?: { id: number } | null;
	children: React.ReactNode;
}) {
	if (!user) {
		return <>{children}</>;
	}

	return <ChatProviderInner userId={user.id}>{children}</ChatProviderInner>;
}

function ChatProviderInner({
	userId,
	children,
}: {
	userId: number;
	children: React.ReactNode;
}) {
	const { revalidate } = useRevalidator();

	const [rooms, setRooms] = React.useState<RoomInfo[]>([]);
	const [messagesByRoom, setMessagesByRoom] = React.useState<
		Record<string, ChatMessage[]>
	>({});
	const [chatUsersCache, setChatUsersCache] = React.useState<
		Record<number, ChatUser>
	>({});
	const [readyState, setReadyState] = React.useState<
		"CONNECTING" | "CONNECTED" | "CLOSED"
	>("CONNECTING");
	const [chatOpen, _setChatOpen] = React.useState(false);
	const [activeRoom, setActiveRoom] = React.useState<string | null>(null);
	const [unreadCounts, setUnreadCounts] = React.useState<
		Record<string, number>
	>({});

	const ws = React.useRef<WebSocket>(undefined);

	const computeUnreadCounts = React.useCallback((roomList: RoomInfo[]) => {
		const counts: Record<string, number> = {};
		for (const room of roomList) {
			const lastRead = readLastReadCount(room.chatCode);
			const unread = Math.max(0, room.totalMessageCount - lastRead);
			counts[room.chatCode] = unread;
		}
		setUnreadCounts(counts);
	}, []);

	const onMessage = React.useEffectEvent((e: MessageEvent) => {
		const parsed = JSON.parse(e.data);
		logger.debug("WS message received:", parsed);

		// Initial rooms payload on connect
		if (parsed.rooms && Array.isArray(parsed.rooms)) {
			logger.debug("WS initial rooms payload, count:", parsed.rooms.length);
			const serverRooms = parsed.rooms as ServerRoomInfo[];
			const roomList = serverRooms.map(flattenServerRoom);
			setRooms(roomList);

			const allChatUsers: Record<number, ChatUser> = {};
			for (const sr of serverRooms) {
				Object.assign(allChatUsers, sr.metadata.chatUsers);
			}
			setChatUsersCache((prev) => ({ ...prev, ...allChatUsers }));
			computeUnreadCounts(roomList);
			return;
		}

		// ROOM_REMOVED: room deleted (e.g. group merge)
		if (parsed.event === "ROOM_REMOVED" && parsed.chatCode) {
			const removedCode = parsed.chatCode as string;
			logger.debug("WS ROOM_REMOVED:", removedCode);
			revalidate();
			setRooms((prev) => prev.filter((r) => r.chatCode !== removedCode));
			setMessagesByRoom((prev) => {
				const { [removedCode]: _, ...rest } = prev;
				return rest;
			});
			setUnreadCounts((prev) => {
				const { [removedCode]: _, ...rest } = prev;
				return rest;
			});
			if (activeRoom === removedCode) {
				setActiveRoom(null);
			}
			return;
		}

		// ROOM_JOINED: new room added
		if (parsed.event === "ROOM_JOINED" && parsed.room) {
			logger.debug("WS ROOM_JOINED:", parsed.room?.chatCode);
			const serverRoom = parsed.room as ServerRoomInfo;
			const newRoom = flattenServerRoom(serverRoom);
			setRooms((prev) => {
				const exists = prev.some((r) => r.chatCode === newRoom.chatCode);
				if (exists) return prev;
				return [...prev, newRoom];
			});

			setChatUsersCache((prev) => ({
				...prev,
				...serverRoom.metadata.chatUsers,
			}));
			return;
		}

		// CHAT_HISTORY response (also returned by SUBSCRIBE with metadata)
		if (parsed.event === "CHAT_HISTORY" && Array.isArray(parsed.messages)) {
			logger.debug(
				"WS CHAT_HISTORY for:",
				parsed.chatCode,
				"messages:",
				parsed.messages.length,
			);
			const chatCode = parsed.chatCode as string;
			const messages = parsed.messages as ChatMessage[];
			setMessagesByRoom((prev) => ({
				...prev,
				[chatCode]: messages,
			}));

			if (parsed.metadata) {
				const metadata = parsed.metadata as RoomMetadata;
				const newRoom: RoomInfo = {
					chatCode,
					header: metadata.header,
					subtitle: metadata.subtitle ?? "",
					url: metadata.url ?? "",
					participantUserIds: metadata.participantUserIds,
					expiresAt: metadata.expiresAt,
					lastMessageTimestamp: messages.at(-1)?.timestamp ?? 0,
					totalMessageCount: messages.length,
				};
				setRooms((prev) => {
					const exists = prev.some((r) => r.chatCode === chatCode);
					if (exists) return prev;
					return [...prev, newRoom];
				});

				if (metadata.chatUsers) {
					setChatUsersCache((prev) => ({ ...prev, ...metadata.chatUsers }));
				}
			}

			return;
		}

		// Regular message(s)
		const messageArr = (
			Array.isArray(parsed) ? parsed : [parsed]
		) as (ChatMessage & { totalMessageCount?: number })[];

		const isSystemMessage = Boolean(messageArr[0].type);
		logger.debug(
			"WS message(s):",
			messageArr.length,
			"system:",
			isSystemMessage,
		);
		if (isSystemMessage) {
			revalidate();
		}

		const sound = messageTypeToSound(messageArr[0].type);
		if (sound && soundEnabled(sound)) {
			const audio = new Audio(soundPath(sound));
			audio.volume = soundVolume() / 100;
			void audio
				.play()
				.catch((err) => logger.error(`Couldn't play sound: ${err}`));
		}

		if (messageArr[0].revalidateOnly) return;

		for (const msg of messageArr) {
			const roomCode = msg.room;
			setMessagesByRoom((prev) => {
				const existing = prev[roomCode] ?? [];
				const pendingIndex = existing.findIndex(
					(m) => m.id === msg.id && m.pending,
				);

				if (pendingIndex !== -1) {
					const updated = [...existing];
					updated[pendingIndex] = msg;
					return { ...prev, [roomCode]: updated };
				}

				return { ...prev, [roomCode]: [...existing, msg] };
			});

			if (msg.totalMessageCount) {
				setRooms((prev) =>
					prev.map((r) =>
						r.chatCode === roomCode
							? {
									...r,
									lastMessageTimestamp: msg.timestamp,
									totalMessageCount: Math.max(
										r.totalMessageCount,
										msg.totalMessageCount!,
									),
								}
							: r,
					),
				);

				if (roomCode === activeRoom && chatOpen) {
					writeLastReadCount(roomCode, msg.totalMessageCount);
				} else {
					setUnreadCounts((prev) => ({
						...prev,
						[roomCode]: (prev[roomCode] ?? 0) + 1,
					}));
				}
			}
		}
	});

	// WebSocket connection
	React.useEffect(() => {
		const wsUrl = import.meta.env.VITE_SKALOP_WS_URL;
		if (!wsUrl) {
			logger.warn("No WS URL provided, ChatProvider not connecting");
			setReadyState("CLOSED");
			return;
		}

		ws.current = new WebSocket(wsUrl, [], {
			maxReconnectionDelay: 20_000,
			reconnectionDelayGrowFactor: 1.5,
		});

		ws.current.onopen = () => {
			setReadyState("CONNECTED");
		};

		ws.current.onclose = () => setReadyState("CLOSED");
		ws.current.onerror = () => setReadyState("CLOSED");
		ws.current.onmessage = onMessage;

		const wsCurrent = ws.current;
		return () => {
			wsCurrent?.close();
		};
	}, []);

	// Ping to keep connection alive
	React.useEffect(() => {
		const interval = setInterval(() => {
			ws.current?.send("");
		}, PING_INTERVAL_MS);

		return () => clearInterval(interval);
	}, []);

	// Listen for cross-tab localStorage changes for unread tracking
	React.useEffect(() => {
		const handleStorage = (e: StorageEvent) => {
			if (!e.key?.startsWith(LOCAL_STORAGE_PREFIX)) return;
			const chatCode = e.key.slice(LOCAL_STORAGE_PREFIX.length);
			const newCount = e.newValue ? Number(e.newValue) : 0;

			setUnreadCounts((prev) => {
				const room = rooms.find((r) => r.chatCode === chatCode);
				if (!room) return prev;
				return {
					...prev,
					[chatCode]: Math.max(0, room.totalMessageCount - newCount),
				};
			});
		};

		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, [rooms]);

	const messagesForRoom = React.useCallback(
		(chatCode: string) => {
			return (messagesByRoom[chatCode] ?? []).sort(
				(a, b) => a.timestamp - b.timestamp,
			);
		},
		[messagesByRoom],
	);

	const send = React.useCallback(
		(chatCode: string, contents: string) => {
			const id = nanoid();
			const message: ChatMessage = {
				id,
				room: chatCode,
				contents,
				timestamp: Date.now(),
				userId,
				pending: true,
			};

			// Optimistic add
			setMessagesByRoom((prev) => ({
				...prev,
				[chatCode]: [...(prev[chatCode] ?? []), message],
			}));

			ws.current?.send(
				JSON.stringify({ event: "MESSAGE", chatCode, id, contents }),
			);
		},
		[userId],
	);

	const subscribe = React.useCallback((chatCode: string) => {
		ws.current?.send(JSON.stringify({ event: "SUBSCRIBE", chatCode }));
	}, []);

	const unsubscribe = React.useCallback((chatCode: string) => {
		ws.current?.send(JSON.stringify({ event: "UNSUBSCRIBE", chatCode }));
	}, []);

	const requestHistory = React.useCallback((chatCode: string) => {
		ws.current?.send(JSON.stringify({ event: "CHAT_HISTORY", chatCode }));
	}, []);

	const markAsRead = React.useCallback(
		(chatCode: string) => {
			const room = rooms.find((r) => r.chatCode === chatCode);
			const messageCount =
				room?.totalMessageCount ?? messagesByRoom[chatCode]?.length ?? 0;
			writeLastReadCount(chatCode, messageCount);
			setUnreadCounts((prev) => ({ ...prev, [chatCode]: 0 }));
		},
		[rooms, messagesByRoom],
	);

	const totalUnreadCount = Object.values(unreadCounts).reduce(
		(sum, count) => sum + count,
		0,
	);

	const setChatOpen = React.useCallback(
		(open: boolean) => {
			_setChatOpen(open);
			if (open && activeRoom) {
				markAsRead(activeRoom);
			}

			if (open && rooms.length === 1 && !activeRoom) {
				requestHistory(rooms[0].chatCode);
				setActiveRoom(rooms[0].chatCode);
			}
		},
		[activeRoom, markAsRead, requestHistory, rooms.length, rooms[0]?.chatCode],
	);

	useFetchUnknownChatUsers({
		messages: messagesByRoom,
		chatUsersCache,
		setChatUsersCache,
	});

	useChatRouteSync({
		rooms,
		userId,
		setActiveRoom,
		setChatOpen,
		subscribe,
		unsubscribe,
		setRooms,
		setMessagesByRoom,
	});

	const contextValue = React.useMemo(
		() => ({
			rooms,
			messagesForRoom,
			send,
			subscribe,
			unsubscribe,
			requestHistory,
			markAsRead,
			unreadCounts,
			totalUnreadCount,
			readyState,
			chatUsers: chatUsersCache,
			chatOpen,
			setChatOpen,
			activeRoom,
			setActiveRoom,
		}),
		[
			rooms,
			messagesForRoom,
			send,
			subscribe,
			unsubscribe,
			requestHistory,
			markAsRead,
			unreadCounts,
			totalUnreadCount,
			readyState,
			chatUsersCache,
			chatOpen,
			activeRoom,
			setChatOpen,
		],
	);

	return (
		<ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
	);
}

// xxx: bug: room should close automatically if non-participant and leaves the route
// xxx: bug: route loading state should show before room metadata loads
function useChatRouteSync({
	rooms,
	userId,
	setActiveRoom,
	setChatOpen,
	subscribe,
	unsubscribe,
	setRooms,
	setMessagesByRoom,
}: {
	rooms: RoomInfo[];
	userId: number;
	setActiveRoom: (chatCode: string | null) => void;
	setChatOpen: (open: boolean) => void;
	subscribe: (chatCode: string) => void;
	unsubscribe: (chatCode: string) => void;
	setRooms: React.Dispatch<React.SetStateAction<RoomInfo[]>>;
	setMessagesByRoom: React.Dispatch<
		React.SetStateAction<Record<string, ChatMessage[]>>
	>;
}) {
	const chatCode = useCurrentRouteChatCode();
	const { pathname } = useLocation();
	const subscribedRoomRef = React.useRef<string | null>(null);
	const previousRouteChatCodeRef = React.useRef<string | null>(null);
	const previousPathnameRef = React.useRef<string | null>(null);

	React.useEffect(() => {
		const previousSubscribed = subscribedRoomRef.current;

		// Clean up previous non-participant subscription if chatCode changed
		if (previousSubscribed && previousSubscribed !== chatCode) {
			unsubscribe(previousSubscribed);
			setRooms((prev) => prev.filter((r) => r.chatCode !== previousSubscribed));
			setMessagesByRoom((prev) => {
				const { [previousSubscribed]: _, ...rest } = prev;
				return rest;
			});
			setActiveRoom(null);
			setChatOpen(false);
			subscribedRoomRef.current = null;
		}

		if (chatCode) {
			const room = rooms.find((r) => r.chatCode === chatCode);
			const isParticipant = room?.participantUserIds.includes(userId);

			if (!isParticipant && subscribedRoomRef.current !== chatCode) {
				logger.debug("Subscribing to non-participant room:", chatCode);
				subscribe(chatCode);
				subscribedRoomRef.current = chatCode;
			}

			const routeChatCodeChanged =
				previousRouteChatCodeRef.current !== chatCode;
			previousRouteChatCodeRef.current = chatCode;

			if (routeChatCodeChanged) {
				setActiveRoom(chatCode);
				setChatOpen(true);
			}
		} else {
			previousRouteChatCodeRef.current = null;

			const pathnameChanged = previousPathnameRef.current !== pathname;
			previousPathnameRef.current = pathname;

			if (pathnameChanged) {
				const matchedRoom = rooms.find(
					(r) => r.url === pathname && r.participantUserIds.includes(userId),
				);

				if (matchedRoom) {
					setActiveRoom(matchedRoom.chatCode);
					setChatOpen(true);
				}
			}
		}
	}, [
		chatCode,
		pathname,
		rooms,
		userId,
		setActiveRoom,
		setChatOpen,
		subscribe,
		unsubscribe,
		setRooms,
		setMessagesByRoom,
	]);
}

function useCurrentRouteChatCode() {
	const matches = useMatches();

	for (const match of matches) {
		const matchData = match.data as { chatCode?: string } | undefined;
		if (matchData?.chatCode) {
			return matchData.chatCode;
		}
	}

	return null;
}

function useFetchUnknownChatUsers({
	messages,
	chatUsersCache,
	setChatUsersCache,
}: {
	messages: Record<string, ChatMessage[]>;
	chatUsersCache: Record<number, ChatUser>;
	setChatUsersCache: React.Dispatch<
		React.SetStateAction<Record<number, ChatUser>>
	>;
}) {
	const fetcher = useFetcher<Record<number, ChatUser>>();

	const unknownIds: number[] = [];
	for (const msgs of Object.values(messages)) {
		for (const msg of msgs) {
			if (msg.userId && !chatUsersCache[msg.userId]) {
				unknownIds.push(msg.userId);
			}
		}
	}

	const idsParam = unknownIds.sort((a, b) => a - b).join(",");

	React.useEffect(() => {
		if (!idsParam || fetcher.state !== "idle") return;

		logger.debug(`Fetching unknown chat users: ${idsParam}`);
		fetcher.load(`/api/chat-users?ids=${idsParam}`);
	}, [idsParam, fetcher.load, fetcher.state]);

	React.useEffect(() => {
		if (!fetcher.data) return;

		setChatUsersCache((prev) => ({ ...prev, ...fetcher.data }));
	}, [fetcher.data, setChatUsersCache]);
}
