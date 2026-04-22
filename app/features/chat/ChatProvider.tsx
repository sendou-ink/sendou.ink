import { nanoid } from "nanoid";
import { WebSocket } from "partysocket";
import * as React from "react";
import {
	useFetcher,
	useLocation,
	useMatches,
	useRevalidator,
} from "react-router";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
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
		imageUrl: serverRoom.metadata.imageUrl ?? "",
		participantUserIds: serverRoom.metadata.participantUserIds,
		expiresAt: serverRoom.metadata.expiresAt,
		lastMessageTimestamp: serverRoom.lastMessageTimestamp ?? 0,
		totalMessageCount: serverRoom.totalMessageCount,
		createdAt: serverRoom.metadata.createdAt ?? 0,
	};
}

const SENDOUQ_GROUP_HEADER_PATTERN = /^Group\b/;

function isSendouQGroupRoom(room: RoomInfo) {
	return (
		room.subtitle === "SendouQ" &&
		SENDOUQ_GROUP_HEADER_PATTERN.test(room.header)
	);
}

function resolveObsoleteGroupRooms(rooms: RoomInfo[]): RoomInfo[] {
	const groupRooms = rooms.filter(isSendouQGroupRoom);

	if (groupRooms.length <= 1) return rooms;

	const newestCreatedAt = Math.max(...groupRooms.map((r) => r.createdAt));

	// If no room has createdAt set, skip resolution
	if (newestCreatedAt === 0) return rooms;

	const obsoleteChatCodes = new Set<string>();
	const removedChatCodes = new Set<string>();

	for (const room of groupRooms) {
		if (room.createdAt === newestCreatedAt) continue;

		if (room.totalMessageCount === 0) {
			removedChatCodes.add(room.chatCode);
		} else {
			obsoleteChatCodes.add(room.chatCode);
		}
	}

	return rooms
		.filter((r) => !removedChatCodes.has(r.chatCode))
		.map((r) =>
			obsoleteChatCodes.has(r.chatCode) ? { ...r, isObsolete: true } : r,
		);
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

	const [isLoading, setIsLoading] = React.useState(true);
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
	const [chatLabels, setChatLabels] = React.useState<Record<number, string>>(
		{},
	);
	const clearChatLabels = React.useCallback(() => setChatLabels({}), []);

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
			const roomList = resolveObsoleteGroupRooms(
				serverRooms.map(flattenServerRoom),
			);
			setRooms(roomList);
			setIsLoading(false);

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
				return resolveObsoleteGroupRooms([...prev, newRoom]);
			});

			setChatUsersCache((prev) => ({
				...prev,
				...serverRoom.metadata.chatUsers,
			}));

			const lastRead = readLastReadCount(serverRoom.chatCode);
			const unread = Math.max(0, serverRoom.totalMessageCount - lastRead);
			setUnreadCounts((prev) => ({
				...prev,
				[serverRoom.chatCode]: unread,
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
					imageUrl: metadata.imageUrl ?? "",
					participantUserIds: metadata.participantUserIds,
					expiresAt: metadata.expiresAt,
					lastMessageTimestamp: messages.at(-1)?.timestamp ?? 0,
					totalMessageCount: messages.length,
					createdAt: metadata.createdAt ?? 0,
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
		) as (ChatMessage & { totalMessageCount: number })[];

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

				if (existing.some((m) => m.id === msg.id)) {
					return prev;
				}

				return { ...prev, [roomCode]: [...existing, msg] };
			});

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

			const isOwnMessage = msg.userId === userId;
			if (isOwnMessage || (roomCode === activeRoom && chatOpen)) {
				writeLastReadCount(roomCode, msg.totalMessageCount);
				setUnreadCounts((prev) => ({ ...prev, [roomCode]: 0 }));
			} else {
				setUnreadCounts((prev) => ({
					...prev,
					[roomCode]: Math.max(
						0,
						msg.totalMessageCount - readLastReadCount(roomCode),
					),
				}));
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
			const parsed = Number(e.newValue);
			const newCount = Number.isFinite(parsed) ? parsed : 0;

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
			return (messagesByRoom[chatCode] ?? []).toSorted(
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
		isLoading,
		activeRoom,
		setActiveRoom,
		setChatOpen,
		subscribe,
		unsubscribe,
		setRooms,
		setMessagesByRoom,
		requestHistory,
		messagesByRoom,
	});

	const contextValue = React.useMemo(
		() => ({
			isLoading,
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
			chatLabels,
			setChatLabels,
			clearChatLabels,
		}),
		[
			isLoading,
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
			chatLabels,
			clearChatLabels,
		],
	);

	return (
		<ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
	);
}

function useChatRouteSync({
	rooms,
	userId,
	isLoading,
	activeRoom,
	setActiveRoom,
	setChatOpen,
	subscribe,
	unsubscribe,
	setRooms,
	setMessagesByRoom,
	requestHistory,
	messagesByRoom,
}: {
	rooms: RoomInfo[];
	userId: number;
	isLoading: boolean;
	activeRoom: string | null;
	setActiveRoom: (chatCode: string | null) => void;
	setChatOpen: (open: boolean) => void;
	subscribe: (chatCode: string) => void;
	unsubscribe: (chatCode: string) => void;
	setRooms: React.Dispatch<React.SetStateAction<RoomInfo[]>>;
	setMessagesByRoom: React.Dispatch<
		React.SetStateAction<Record<string, ChatMessage[]>>
	>;
	requestHistory: (chatCode: string) => void;
	messagesByRoom: Record<string, ChatMessage[]>;
}) {
	const rawChatCode = useCurrentRouteChatCode();
	const chatCodesKey = rawChatCode
		? Array.isArray(rawChatCode)
			? rawChatCode.join(",")
			: rawChatCode
		: "";
	const { pathname } = useLocation();
	const layoutSize = useLayoutSize();
	const subscribedRoomRef = React.useRef<string[]>([]);
	const previousRouteChatCodeRef = React.useRef<string[]>([]);
	const previousPathnameRef = React.useRef<string | null>(null);

	React.useEffect(() => {
		if (isLoading) return;

		const chatCodes = chatCodesKey ? chatCodesKey.split(",") : [];

		// Clean up subscriptions for rooms no longer in chatCodes
		const previousSubscribed = subscribedRoomRef.current;
		const removedRooms = previousSubscribed.filter(
			(code) => !chatCodes.includes(code),
		);
		for (const code of removedRooms) {
			unsubscribe(code);
			setRooms((prev) => prev.filter((r) => r.chatCode !== code));
			setMessagesByRoom((prev) => {
				const { [code]: _, ...rest } = prev;
				return rest;
			});
			if (activeRoom === code) {
				setActiveRoom(null);
				setChatOpen(false);
			}
		}
		if (removedRooms.length > 0) {
			subscribedRoomRef.current = previousSubscribed.filter((code) =>
				chatCodes.includes(code),
			);
		}

		if (chatCodes.length > 0) {
			for (const code of chatCodes) {
				const alreadyInRooms = rooms.some((r) => r.chatCode === code);

				if (!alreadyInRooms && !subscribedRoomRef.current.includes(code)) {
					logger.debug("Subscribing to non-participant room:", code);
					subscribe(code);
					subscribedRoomRef.current = [...subscribedRoomRef.current, code];
				}
			}

			const previousCodes = previousRouteChatCodeRef.current;
			const routeChatCodeChanged =
				chatCodes.length !== previousCodes.length ||
				chatCodes.some((code, i) => previousCodes[i] !== code);
			previousRouteChatCodeRef.current = chatCodes;

			if (routeChatCodeChanged) {
				setActiveRoom(chatCodes[0]);
				if (!messagesByRoom[chatCodes[0]]) {
					requestHistory(chatCodes[0]);
				}
				if (layoutSize === "desktop") {
					setChatOpen(true);
				}
			}
		} else {
			previousRouteChatCodeRef.current = [];

			const pathnameChanged = previousPathnameRef.current !== pathname;
			previousPathnameRef.current = pathname;

			if (pathnameChanged) {
				const matchedRoom = rooms.find(
					(r) => r.url === pathname && r.participantUserIds.includes(userId),
				);

				if (matchedRoom) {
					setActiveRoom(matchedRoom.chatCode);
					if (!messagesByRoom[matchedRoom.chatCode]) {
						requestHistory(matchedRoom.chatCode);
					}
					if (layoutSize === "desktop") {
						setChatOpen(true);
					}
				}
			}
		}
	}, [
		isLoading,
		chatCodesKey,
		pathname,
		rooms,
		userId,
		activeRoom,
		setActiveRoom,
		setChatOpen,
		layoutSize,
		subscribe,
		unsubscribe,
		setRooms,
		setMessagesByRoom,
		requestHistory,
		messagesByRoom,
	]);
}

function useCurrentRouteChatCode(): string | string[] | null {
	const matches = useMatches();

	for (const match of matches) {
		const matchData = match.data as
			| { chatCode?: string | string[] }
			| undefined;
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
