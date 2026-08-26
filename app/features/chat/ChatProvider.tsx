import * as React from "react";
import { useLocation, useMatches } from "react-router";
import { eventsClient } from "~/features/events/events-client";
import {
	useEventStreamCatchUp,
	useEventsConnection,
} from "~/features/events/events-hooks";
import { chatRoomChannel } from "~/features/events/events-types";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
import type { LoggedInUser } from "~/root";
import { type ChatSnapshot, chatClient } from "./chat-client";
import { useServerRevalidationEvents } from "./chat-hooks";
import type { ChatContextValue } from "./chat-provider-types";
import type {
	ChatRoomListItem,
	ClientChatMessage,
	ReadOnlyChatRoom,
} from "./chat-types";
import { ChatContext } from "./useChatContext";

const EMPTY_MESSAGES: ClientChatMessage[] = [];

const SERVER_SNAPSHOT: ChatSnapshot = {
	roomsLoaded: false,
	rooms: [],
	roomsById: new Map(),
	totalUnreadCount: 0,
	messagesByRoomId: new Map(),
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function ChatProvider({
	user,
	children,
}: {
	user?: LoggedInUser | null;
	children: React.ReactNode;
}) {
	if (!user) {
		return <>{children}</>;
	}

	return <ChatProviderInner user={user}>{children}</ChatProviderInner>;
}

function ChatProviderInner({
	user,
	children,
}: {
	user: LoggedInUser;
	children: React.ReactNode;
}) {
	useEventsConnection(true);
	useServerRevalidationEvents(user.id);

	const snapshot = React.useSyncExternalStore(
		chatClient.subscribe,
		chatClient.getSnapshot,
		getServerSnapshot,
	);

	React.useEffect(() => {
		chatClient.start(user.id);
		return () => chatClient.stop();
	}, [user.id]);

	useEventStreamCatchUp({
		enabled: true,
		onCatchUp: () => chatClient.catchUp(),
	});

	const [chatOpen, _setChatOpen] = React.useState(false);
	const [activeRoomIds, setActiveRoomIds] = React.useState<number[]>([]);

	// messages arriving to a room on screen are read immediately instead of counting unread
	React.useEffect(() => {
		chatClient.setViewedRoomIds(chatOpen ? activeRoomIds : []);
	}, [chatOpen, activeRoomIds]);

	const rooms = snapshot.rooms;

	// a room that vanished from the list is one the user lost access to (e.g.
	// left the group) — close its open view. Only ever-listed rooms count: a
	// just-created room the loader knows before the list does must not have
	// the view it just opened closed underneath it.
	const previouslyListedRoomIdsRef = React.useRef(new Set<number>());
	React.useEffect(() => {
		if (!snapshot.roomsLoaded) return;

		const listedRoomIds = new Set(rooms.map((room) => room.id));
		const previouslyListed = previouslyListedRoomIdsRef.current;
		previouslyListedRoomIdsRef.current = listedRoomIds;

		const keptActiveRoomIds = activeRoomIds.filter(
			(roomId) => !previouslyListed.has(roomId) || listedRoomIds.has(roomId),
		);
		if (keptActiveRoomIds.length !== activeRoomIds.length) {
			setActiveRoomIds(keptActiveRoomIds);
		}
	}, [snapshot.roomsLoaded, rooms, activeRoomIds]);

	const setChatOpen = React.useCallback(
		(open: boolean) => {
			_setChatOpen(open);
			if (!open) return;

			if (activeRoomIds.length > 0) {
				for (const roomId of activeRoomIds) {
					chatClient.markRead(roomId);
				}
			} else if (rooms.length === 1) {
				setActiveRoomIds([rooms[0].id]);
				chatClient.ensureMessagesLoaded(rooms[0].id);
				chatClient.markRead(rooms[0].id);
			}
		},
		[activeRoomIds, rooms.length, rooms[0]?.id],
	);

	// route sync opens its own rooms directly: going through `setChatOpen` would
	// read the previous render's empty `activeRoomIds` and auto-pick the user's
	// only listed room over the route's rooms
	const openChatForRooms = React.useCallback((roomIds: number[]) => {
		setActiveRoomIds(roomIds);
		_setChatOpen(true);
		for (const roomId of roomIds) {
			chatClient.markRead(roomId);
		}
	}, []);

	useChatRouteSync({
		userId: user.id,
		roomsLoaded: snapshot.roomsLoaded,
		rooms,
		setActiveRoomIds,
		openChatForRooms,
	});

	const sendMessage = React.useCallback(
		(roomId: number, message: { publicId: string; contents: string }) => {
			chatClient.send(roomId, {
				...message,
				author: {
					id: user.id,
					username: user.username,
					discordId: user.discordId,
					discordAvatar: user.discordAvatar,
					customUrl: user.customUrl ?? null,
					customAvatarUrl: user.customAvatarUrl ?? null,
					pronouns: null,
					chatNameHue: null,
				},
			});
		},
		[user],
	);

	const messagesForRoom = React.useCallback(
		(roomId: number) => snapshot.messagesByRoomId.get(roomId) ?? EMPTY_MESSAGES,
		[snapshot.messagesByRoomId],
	);

	const roomForId = React.useCallback(
		(roomId: number) => snapshot.roomsById.get(roomId),
		[snapshot.roomsById],
	);

	const contextValue = React.useMemo<ChatContextValue>(
		() => ({
			roomsLoaded: snapshot.roomsLoaded,
			rooms,
			roomForId,
			messagesForRoom,
			ensureMessagesLoaded: chatClient.ensureMessagesLoaded,
			sendMessage,
			markAsRead: chatClient.markRead,
			totalUnreadCount: snapshot.totalUnreadCount,
			chatOpen,
			setChatOpen,
			activeRoomIds,
			setActiveRoomIds,
		}),
		[
			snapshot.roomsLoaded,
			snapshot.totalUnreadCount,
			rooms,
			roomForId,
			messagesForRoom,
			sendMessage,
			chatOpen,
			setChatOpen,
			activeRoomIds,
		],
	);

	return (
		<ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
	);
}

function useChatRouteSync({
	userId,
	roomsLoaded,
	rooms,
	setActiveRoomIds,
	openChatForRooms,
}: {
	userId: number;
	roomsLoaded: boolean;
	rooms: ChatRoomListItem[];
	setActiveRoomIds: (roomIds: number[]) => void;
	openChatForRooms: (roomIds: number[]) => void;
}) {
	const routeRoomIdsKey = useCurrentRouteChatRoomIds().join(",");
	const readOnlyRoomIdsKey = useCurrentRouteReadOnlyChatRooms()
		.map((room) => room.roomId)
		.join(",");
	const { pathname } = useLocation();
	const layoutSize = useLayoutSize();
	const previousRouteRoomIdsKeyRef = React.useRef<string | null>(null);
	const previousPathnameRef = React.useRef<string | null>(null);

	// revalidate broadcasts for the page's rooms (e.g. a score report on the
	// match the user is viewing) arrive on the rooms' topic channels
	React.useEffect(() => {
		const roomIds = [
			...roomIdsFromKey(routeRoomIdsKey),
			...roomIdsFromKey(readOnlyRoomIdsKey),
		];
		const unsubscribes = roomIds.map((roomId) =>
			eventsClient.subscribeTopic(chatRoomChannel(roomId)),
		);
		return () => {
			for (const unsubscribe of unsubscribes) {
				unsubscribe();
			}
		};
	}, [routeRoomIdsKey, readOnlyRoomIdsKey]);

	// read-only rooms are listed in the sidebar for the observer to open themselves,
	// so they are only made known, never opened
	React.useEffect(() => {
		for (const roomId of roomIdsFromKey(readOnlyRoomIdsKey)) {
			chatClient.ensureRoomKnown(roomId);
		}
	}, [readOnlyRoomIdsKey]);

	React.useEffect(() => {
		if (!roomsLoaded) return;

		const routeRoomIds = roomIdsFromKey(routeRoomIdsKey);

		if (routeRoomIds.length > 0) {
			const routeRoomIdsChanged =
				previousRouteRoomIdsKeyRef.current !== routeRoomIdsKey;
			previousRouteRoomIdsKeyRef.current = routeRoomIdsKey;

			if (!routeRoomIdsChanged) return;

			// the loader can know about a just-created room before the room list
			// does; an observer's room is never in the list at all, so its info is
			// fetched separately as an observed room
			for (const roomId of routeRoomIds) {
				if (rooms.every((room) => room.id !== roomId)) {
					void chatClient.refreshRooms();
					chatClient.ensureRoomKnown(roomId);
				}
			}

			setActiveRoomIds(routeRoomIds);
			for (const roomId of routeRoomIds) {
				chatClient.ensureMessagesLoaded(roomId);
			}
			if (layoutSize === "desktop") {
				openChatForRooms(routeRoomIds);
			}
			return;
		}

		previousRouteRoomIdsKeyRef.current = null;

		const pathnameChanged = previousPathnameRef.current !== pathname;
		previousPathnameRef.current = pathname;
		if (!pathnameChanged) return;

		const matchedRoom = rooms.find(
			(room) =>
				room.url === pathname && room.participantUserIds.includes(userId),
		);
		if (!matchedRoom) return;

		setActiveRoomIds([matchedRoom.id]);
		chatClient.ensureMessagesLoaded(matchedRoom.id);
		if (layoutSize === "desktop") {
			openChatForRooms([matchedRoom.id]);
		}
	}, [
		roomsLoaded,
		routeRoomIdsKey,
		pathname,
		rooms,
		userId,
		setActiveRoomIds,
		openChatForRooms,
		layoutSize,
	]);
}

/**
 * Chat rooms the current route wants visible, from its loader's `chatRoomIds`.
 * A route may expose several (e.g. a SendouQ match exposes the match chat
 * alongside the user's own group chat) which are then shown as a single
 * combined split view.
 */
export function useCurrentRouteChatRoomIds(): number[] {
	const matches = useMatches();

	for (const match of matches) {
		const matchData = match.loaderData as
			| { chatRoomIds?: number[] }
			| undefined;
		if (matchData?.chatRoomIds && matchData.chatRoomIds.length > 0) {
			return matchData.chatRoomIds;
		}
	}

	return [];
}

/**
 * Chat rooms the current route surfaces in the sidebar list without opening
 * them, from its loader's `readOnlyChatRooms` (a staff member reading the group
 * chats of a SendouQ match they are not in).
 */
export function useCurrentRouteReadOnlyChatRooms(): ReadOnlyChatRoom[] {
	const matches = useMatches();

	for (const match of matches) {
		const matchData = match.loaderData as
			| { readOnlyChatRooms?: ReadOnlyChatRoom[] }
			| undefined;
		if (
			matchData?.readOnlyChatRooms &&
			matchData.readOnlyChatRooms.length > 0
		) {
			return matchData.readOnlyChatRooms;
		}
	}

	return [];
}

function roomIdsFromKey(key: string) {
	return key ? key.split(",").map(Number) : [];
}
