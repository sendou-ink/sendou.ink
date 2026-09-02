import * as React from "react";
import { useLocation, useMatches } from "react-router";
import { preloadChatSidebar } from "~/components/layout/LazyChatSidebar";
import { eventsClient } from "~/features/events/events-client";
import {
	useEventStreamCatchUp,
	useEventsConnection,
} from "~/features/events/events-hooks";
import { chatRoomChannel } from "~/features/events/events-types";
import { useLayoutSize } from "~/hooks/useLayoutSize";
import type { LoggedInUser } from "~/root";
import { type ChatSnapshot, chatClient } from "./chat-client";
import { useServerRevalidationEvents } from "./chat-hooks";
import type {
	ChatRoomListItem,
	ClientChatMessage,
	RouteChatRoom,
} from "./chat-types";

const EMPTY_MESSAGES: ClientChatMessage[] = [];

const SERVER_SNAPSHOT: ChatSnapshot = {
	roomsLoaded: false,
	rooms: [],
	roomsById: new Map(),
	observedRoomIds: new Set(),
	totalUnreadCount: 0,
	messagesByRoomId: new Map(),
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

interface ChatContextValue {
	/** False until the first rooms fetch has landed. */
	roomsLoaded: boolean;
	rooms: ChatRoomListItem[];
	/** Looks a room up from the list or the route-opened observed rooms (observer access). */
	roomForId: (roomId: number) => ChatRoomListItem | undefined;
	messagesForRoom: (roomId: number) => ClientChatMessage[];
	/** Fetches the room's history unless it is already loaded or loading. */
	ensureMessagesLoaded: (roomId: number) => void;
	/** Sends the message outside the router (no revalidation), rendering it optimistically until the echo or POST response confirms it. */
	sendMessage: (
		roomId: number,
		message: { publicId: string; contents: string },
	) => void;
	markAsRead: (roomId: number) => void;
	totalUnreadCount: number;
	chatOpen: boolean;
	setChatOpen: (open: boolean) => void;
	/** Rooms on screen: none, one, or several (split view, the first being primary). */
	activeRoomIds: number[];
	setActiveRoomIds: (roomIds: number[]) => void;
}

const ChatContext = React.createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue | null {
	return React.useContext(ChatContext);
}

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

	// a page being left never reaches `stop()`, so the debounced read indicators
	// are posted while the document is still there to post them
	React.useEffect(() => {
		const flushReadsWhenHidden = () => {
			if (document.visibilityState === "visible") return;

			chatClient.flushReads();
		};

		window.addEventListener("pagehide", chatClient.flushReads);
		document.addEventListener("visibilitychange", flushReadsWhenHidden);
		return () => {
			window.removeEventListener("pagehide", chatClient.flushReads);
			document.removeEventListener("visibilitychange", flushReadsWhenHidden);
		};
	}, []);

	useEventStreamCatchUp({
		enabled: true,
		onCatchUp: () => chatClient.catchUp(),
	});

	const [chatOpen, setChatOpenState] = React.useState(false);
	const [activeRoomIds, setActiveRoomIds] = React.useState<number[]>([]);

	// the sidebar chunk is fetched as soon as there is something to open it for,
	// so that opening chat never waits on a download
	const hasRoomToOpen =
		snapshot.rooms.length > 0 || activeRoomIds.length > 0 || chatOpen;
	React.useEffect(() => {
		if (!hasRoomToOpen) return;

		preloadChatSidebar();
	}, [hasRoomToOpen]);

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

	const setChatOpen = (open: boolean) => {
		setChatOpenState(open);
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
	};

	useChatRouteSync({
		userId: user.id,
		roomsLoaded: snapshot.roomsLoaded,
		rooms,
		observedRoomIds: snapshot.observedRoomIds,
		setActiveRoomIds,
		setChatOpenState,
	});

	const sendMessage = (
		roomId: number,
		message: { publicId: string; contents: string },
	) => {
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
	};

	const contextValue: ChatContextValue = {
		roomsLoaded: snapshot.roomsLoaded,
		rooms,
		roomForId: (roomId) => snapshot.roomsById.get(roomId),
		messagesForRoom: (roomId) =>
			snapshot.messagesByRoomId.get(roomId) ?? EMPTY_MESSAGES,
		ensureMessagesLoaded: chatClient.ensureMessagesLoaded,
		sendMessage,
		markAsRead: chatClient.markRead,
		totalUnreadCount: snapshot.totalUnreadCount,
		chatOpen,
		setChatOpen,
		activeRoomIds,
		setActiveRoomIds,
	};

	return (
		<ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
	);
}

function useChatRouteSync({
	userId,
	roomsLoaded,
	rooms,
	observedRoomIds,
	setActiveRoomIds,
	setChatOpenState,
}: {
	userId: number;
	roomsLoaded: boolean;
	rooms: ChatRoomListItem[];
	observedRoomIds: ReadonlySet<number>;
	setActiveRoomIds: React.Dispatch<React.SetStateAction<number[]>>;
	setChatOpenState: (open: boolean) => void;
}) {
	const routeRooms = useCurrentRouteChatRooms();
	// keys rather than the arrays themselves: a route revalidation hands over
	// equal-but-new loader data that must not re-run the effects
	const routeRoomIdsKey = routeRooms.map((room) => room.roomId).join(",");
	const autoOpenRoomIdsKey = routeRooms
		.filter((room) => room.autoOpen)
		.map((room) => room.roomId)
		.join(",");
	const { pathname } = useLocation();
	const layoutSize = useLayoutSize();
	const previousRouteRoomIdsKeyRef = React.useRef<string | null>(null);
	const previousPathnameRef = React.useRef<string | null>(null);

	// revalidate broadcasts for the page's rooms (e.g. a score report on the
	// match the user is viewing) arrive on the rooms' topic channels
	React.useEffect(() => {
		const unsubscribes = roomIdsFromKey(routeRoomIdsKey).map((roomId) =>
			eventsClient.subscribeTopic(chatRoomChannel(roomId)),
		);
		return () => {
			for (const unsubscribe of unsubscribes) {
				unsubscribe();
			}
		};
	}, [routeRoomIdsKey]);

	React.useEffect(() => {
		if (!roomsLoaded) return;

		// route sync opens its own rooms directly: going through the context's
		// `setChatOpen` would read the previous render's empty `activeRoomIds` and
		// auto-pick the user's only listed room over the route's rooms
		const openChatForRooms = (roomIds: number[]) => {
			setActiveRoomIds(roomIds);
			setChatOpenState(true);
			for (const roomId of roomIds) {
				chatClient.markRead(roomId);
			}
		};

		const autoOpenRoomIds = roomIdsFromKey(autoOpenRoomIdsKey);
		const routeRoomIdsChanged =
			previousRouteRoomIdsKeyRef.current !== routeRoomIdsKey;
		previousRouteRoomIdsKeyRef.current = routeRoomIdsKey;

		if (routeRoomIdsChanged) {
			// an observed room is only reachable from the route that surfaced it (an
			// admin reading a chat they are not in), so leaving that route closes it
			// and returns to the room list
			const routeRoomIds = new Set(roomIdsFromKey(routeRoomIdsKey));
			setActiveRoomIds((openRoomIds) => {
				const kept = openRoomIds.filter(
					(roomId) => routeRoomIds.has(roomId) || !observedRoomIds.has(roomId),
				);
				return kept.length === openRoomIds.length ? openRoomIds : kept;
			});

			// the loader can know about a just-created room before the room list
			// does; an observer's room is never in the list at all, so its info is
			// fetched separately as an observed room
			for (const roomId of roomIdsFromKey(routeRoomIdsKey)) {
				if (rooms.some((room) => room.id === roomId)) continue;

				if (autoOpenRoomIds.includes(roomId)) {
					void chatClient.refreshRooms();
				}
				chatClient.ensureRoomKnown(roomId);
			}
		}

		if (autoOpenRoomIds.length > 0) {
			if (!routeRoomIdsChanged) return;

			setActiveRoomIds(autoOpenRoomIds);
			for (const roomId of autoOpenRoomIds) {
				chatClient.ensureMessagesLoaded(roomId);
			}
			if (layoutSize === "desktop") {
				openChatForRooms(autoOpenRoomIds);
			}
			return;
		}

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
		autoOpenRoomIdsKey,
		pathname,
		rooms,
		observedRoomIds,
		userId,
		setActiveRoomIds,
		setChatOpenState,
		layoutSize,
	]);
}

/**
 * Chat rooms the current route surfaces (loader `chatRooms`). `autoOpen` ones open for the viewer
 * (a SendouQ match opens match chat and group chat as one split view); the rest are only listed
 * for the viewer to open (staff reading group chats of a match they are not in).
 */
export function useCurrentRouteChatRooms(): RouteChatRoom[] {
	const matches = useMatches();

	for (const match of matches) {
		const matchData = match.loaderData as
			| { chatRooms?: RouteChatRoom[] }
			| undefined;
		if (matchData?.chatRooms && matchData.chatRooms.length > 0) {
			return matchData.chatRooms;
		}
	}

	return [];
}

function roomIdsFromKey(key: string) {
	return key ? key.split(",").map(Number) : [];
}
