import { nanoid } from "nanoid";
import { WebSocket } from "partysocket";
import * as React from "react";
import { useMatches, useRevalidator } from "react-router";
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
const USER_FETCH_BATCH_DELAY_MS = 200;

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
	const [sidebarOpen, _setSidebarOpen] = React.useState(false);
	const [activeRoom, setActiveRoom] = React.useState<string | null>(null);
	const [unreadCounts, setUnreadCounts] = React.useState<
		Record<string, number>
	>({});

	const ws = React.useRef<WebSocket>(undefined);
	const pendingUserFetches = React.useRef<Set<number>>(new Set());
	const fetchTimeoutRef =
		React.useRef<ReturnType<typeof setTimeout>>(undefined);

	const computeUnreadCounts = React.useCallback((roomList: RoomInfo[]) => {
		const counts: Record<string, number> = {};
		for (const room of roomList) {
			const lastRead = readLastReadCount(room.chatCode);
			const unread = Math.max(0, room.totalMessageCount - lastRead);
			counts[room.chatCode] = unread;
		}
		setUnreadCounts(counts);
	}, []);

	const fetchUnknownUsers = React.useCallback((userIds: number[]) => {
		for (const id of userIds) {
			pendingUserFetches.current.add(id);
		}

		clearTimeout(fetchTimeoutRef.current);
		fetchTimeoutRef.current = setTimeout(async () => {
			const ids = [...pendingUserFetches.current];
			pendingUserFetches.current.clear();

			if (ids.length === 0) return;

			try {
				// xxx: we should use remix fetcher for this
				const response = await fetch(`/api/chat-users?ids=${ids.join(",")}`);
				if (!response.ok) return;

				const users = (await response.json()) as Record<number, ChatUser>;
				setChatUsersCache((prev) => ({ ...prev, ...users }));
			} catch {
				// fetch failed, will retry on next unknown user
			}
		}, USER_FETCH_BATCH_DELAY_MS);
	}, []);

	const onMessage = React.useEffectEvent((e: MessageEvent) => {
		const parsed = JSON.parse(e.data);

		// Initial rooms payload on connect
		if (parsed.rooms && Array.isArray(parsed.rooms)) {
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

		// ROOM_JOINED: new room added
		if (parsed.event === "ROOM_JOINED" && parsed.room) {
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

			if (msg.userId && !chatUsersCache[msg.userId]) {
				fetchUnknownUsers([msg.userId]);
			}

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

				if (roomCode === activeRoom && sidebarOpen) {
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

	const setSidebarOpen = React.useCallback(
		(open: boolean) => {
			_setSidebarOpen(open);
			if (open && activeRoom) {
				markAsRead(activeRoom);
			}
		},
		[activeRoom, markAsRead],
	);

	useChatRouteSync({
		rooms,
		userId,
		setActiveRoom,
		setSidebarOpen,
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
			sidebarOpen,
			setSidebarOpen,
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
			sidebarOpen,
			activeRoom,
			setSidebarOpen,
		],
	);

	return (
		<ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
	);
}

// xxx: bug: when viewing as non-participant can't go back to list view
// xxx: bug: room should close automatically if non-participant and leaves the route
// xxx: bug: route loading state should show before room metadata loads
function useChatRouteSync({
	rooms,
	userId,
	setActiveRoom,
	setSidebarOpen,
	subscribe,
	unsubscribe,
	setRooms,
	setMessagesByRoom,
}: {
	rooms: RoomInfo[];
	userId: number;
	setActiveRoom: (chatCode: string | null) => void;
	setSidebarOpen: (open: boolean) => void;
	subscribe: (chatCode: string) => void;
	unsubscribe: (chatCode: string) => void;
	setRooms: React.Dispatch<React.SetStateAction<RoomInfo[]>>;
	setMessagesByRoom: React.Dispatch<
		React.SetStateAction<Record<string, ChatMessage[]>>
	>;
}) {
	const matches = useMatches();
	const subscribedRoomRef = React.useRef<string | null>(null);

	React.useEffect(() => {
		let chatCode: string | null = null;

		for (const match of matches) {
			const matchData = match.data as { chatCode?: string } | undefined;
			if (matchData?.chatCode) {
				chatCode = matchData.chatCode;
				break;
			}
		}

		const previousSubscribed = subscribedRoomRef.current;

		// Clean up previous non-participant subscription if chatCode changed
		if (previousSubscribed && previousSubscribed !== chatCode) {
			unsubscribe(previousSubscribed);
			setRooms((prev) => prev.filter((r) => r.chatCode !== previousSubscribed));
			setMessagesByRoom((prev) => {
				const { [previousSubscribed]: _, ...rest } = prev;
				return rest;
			});
			subscribedRoomRef.current = null;
		}

		if (!chatCode) return;

		const room = rooms.find((r) => r.chatCode === chatCode);
		const isParticipant = room?.participantUserIds.includes(userId);

		if (!isParticipant && subscribedRoomRef.current !== chatCode) {
			subscribe(chatCode);
			subscribedRoomRef.current = chatCode;
		}

		setActiveRoom(chatCode);
		setSidebarOpen(true);
	}, [
		matches,
		rooms,
		userId,
		setActiveRoom,
		setSidebarOpen,
		subscribe,
		unsubscribe,
		setRooms,
		setMessagesByRoom,
	]);
}
