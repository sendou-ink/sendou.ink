import * as React from "react";
import { useLocation, useMatches } from "react-router";
import { eventsClient } from "~/features/events/events-client";
import {
	useEventStreamCatchUp,
	useEventsConnection,
} from "~/features/events/events-hooks";
import { chatRoomChannel } from "~/features/events/events-types";
import { useHydrated } from "~/hooks/useHydrated";
import { useLayoutSize } from "~/hooks/useLayoutSize";
import type { LoggedInUser } from "~/root";
import {
	type ChatSnapshot,
	chatClient,
	snapshotFromLoaderData,
} from "./chat-client";
import { useServerRevalidationEvents } from "./chat-hooks";
import type {
	ChatRoomListItem,
	ClientChatMessage,
	RouteChatRoom,
} from "./chat-types";

const EMPTY_MESSAGES: ClientChatMessage[] = [];
const EMPTY_ROOM_LIST: ChatRoomListItem[] = [];
const EMPTY_ROUTE_ROOMS: RouteChatRoom[] = [];

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
	roomList,
	children,
}: {
	user?: LoggedInUser | null;
	/** The user's rooms as the root loader served them. */
	roomList?: ChatRoomListItem[];
	children: React.ReactNode;
}) {
	if (!user) {
		return <>{children}</>;
	}

	return (
		<ChatProviderInner user={user} roomList={roomList ?? EMPTY_ROOM_LIST}>
			{children}
		</ChatProviderInner>
	);
}

function ChatProviderInner({
	user,
	roomList,
	children,
}: {
	user: LoggedInUser;
	roomList: ChatRoomListItem[];
	children: React.ReactNode;
}) {
	useEventsConnection(true);
	useServerRevalidationEvents(user.id);

	const hydrated = useHydrated();
	const routeRooms = useCurrentRouteChatRooms();

	const storeSnapshot = React.useSyncExternalStore(
		chatClient.subscribe,
		chatClient.getSnapshot,
		getServerSnapshot,
	);
	// the loader data stands in until the live client holds it, so the page
	// arrives with its chat the way it will stay; memoized to keep the effects
	// depending on it off the render loop
	const loaderSnapshot = React.useMemo(
		() => snapshotFromLoaderData(roomList, routeRooms),
		[roomList, routeRooms],
	);
	const snapshot = storeSnapshot.roomsLoaded ? storeSnapshot : loaderSnapshot;

	React.useEffect(() => {
		chatClient.applyRoomList(roomList);
	}, [roomList]);

	React.useEffect(() => {
		chatClient.applyRouteRooms(routeRooms);
	}, [routeRooms]);

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
		// the loader data is at most as old as the navigation that fetched it
		heldSince: performance.timeOrigin,
	});

	const autoOpenRoomIdsKey = routeRooms
		.filter((room) => room.autoOpen)
		.map((room) => room.room.id)
		.join(",");
	const [chatOpenState, setChatOpenState] = React.useState(false);
	const [activeRoomIds, setActiveRoomIds] = React.useState<number[]>(() =>
		roomIdsFromKey(autoOpenRoomIdsKey),
	);
	// the server renders a route's rooms open as the desktop layout has them
	// (smaller layouts hide the rail); the route sync settles it once the
	// layout is known
	const chatOpen =
		chatOpenState || (!hydrated && autoOpenRoomIdsKey.length > 0);

	// messages arriving to a room on screen are read immediately instead of counting unread
	React.useEffect(() => {
		chatClient.setViewedRoomIds(chatOpenState ? activeRoomIds : []);
	}, [chatOpenState, activeRoomIds]);

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
		hydrated,
		roomsLoaded: snapshot.roomsLoaded,
		rooms,
		observedRoomIds: snapshot.observedRoomIds,
		routeRooms,
		autoOpenRoomIdsKey,
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
	hydrated,
	roomsLoaded,
	rooms,
	observedRoomIds,
	routeRooms,
	autoOpenRoomIdsKey,
	setActiveRoomIds,
	setChatOpenState,
}: {
	userId: number;
	hydrated: boolean;
	roomsLoaded: boolean;
	rooms: ChatRoomListItem[];
	observedRoomIds: ReadonlySet<number>;
	routeRooms: RouteChatRoom[];
	autoOpenRoomIdsKey: string;
	setActiveRoomIds: React.Dispatch<React.SetStateAction<number[]>>;
	setChatOpenState: (open: boolean) => void;
}) {
	// keys rather than the arrays themselves: a route revalidation hands over
	// equal-but-new loader data that must not re-run the effects
	const routeRoomIdsKey = routeRooms.map((room) => room.room.id).join(",");
	const latestRouteRoomsRef = React.useRef(routeRooms);
	latestRouteRoomsRef.current = routeRooms;
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
		// the hydration render's layout size is the server's guess, so a room
		// opening on arrival waits for the real one
		if (!roomsLoaded || !hydrated) return;

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

			// the loader can know about a just-created room of the user's own before
			// the room list does: refetched so it gets listed rather than merely observed
			const unlistedOwnRoom = latestRouteRoomsRef.current.find(
				(entry) =>
					entry.room.participantUserIds.includes(userId) &&
					!rooms.some((room) => room.id === entry.room.id),
			);
			if (unlistedOwnRoom) {
				void chatClient.refreshRooms();
			}
		}

		if (autoOpenRoomIds.length > 0) {
			if (!routeRoomIdsChanged) return;

			setActiveRoomIds(autoOpenRoomIds);
			// a room opening on arrival brings its history along; one that did not
			// (an older loader response) is fetched
			for (const entry of latestRouteRoomsRef.current) {
				if (entry.autoOpen && entry.messages === null) {
					chatClient.ensureMessagesLoaded(entry.room.id);
				}
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
		hydrated,
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

	return EMPTY_ROUTE_ROOMS;
}

function roomIdsFromKey(key: string) {
	return key ? key.split(",").map(Number) : [];
}
