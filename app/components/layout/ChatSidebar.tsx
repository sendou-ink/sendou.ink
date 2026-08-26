import clsx from "clsx";
import type { TFunction } from "i18next";
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	MessageSquare,
	X,
} from "lucide-react";
import * as React from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
	useChatContext,
	useCurrentRouteChatRoomIds,
	useCurrentRouteReadOnlyChatRooms,
} from "~/features/chat/ChatProvider";
import type { ChatRoomListItem } from "~/features/chat/chat-types";
import { Chat } from "~/features/chat/components/Chat";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { navIconUrl } from "~/utils/urls";
import {
	NavIconContainer,
	NavListButton,
	NavListImage,
	NavListSubtitle,
	NavListTexts,
	NavListTitle,
} from "../SideNav";
import styles from "./ChatSidebar.module.css";

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
	const chatContext = useChatContext();

	if (!chatContext) return null;

	if (chatContext.activeRoomIds.length > 0) {
		return <ChatView onClose={onClose} />;
	}

	if (!chatContext.roomsLoaded) {
		return <LoadingState onClose={onClose} />;
	}

	return <RoomList onClose={onClose} />;
}

interface RoomDisplay {
	title: string;
	subtitle: string;
	imageUrl: string;
}

function useRoomDisplay() {
	const { t } = useTranslation(["common"]);
	const { formatter: dateFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	return (room: ChatRoomListItem): RoomDisplay => {
		switch (room.type) {
			case "SQ_GROUP": {
				return {
					title: t("common:chat.room.group", {
						members: room.participantUserIds.length,
					}),
					subtitle: "SendouQ",
					imageUrl: `${navIconUrl("sendouq")}.avif`,
				};
			}
			case "SQ_MATCH": {
				return {
					title: t("common:chat.room.match", { id: room.titleParams.matchId }),
					subtitle: "SendouQ",
					imageUrl: `${navIconUrl("sendouq")}.avif`,
				};
			}
			case "TOURNAMENT_MATCH": {
				return {
					title: t("common:chat.room.match", { id: room.titleParams.matchId }),
					subtitle: room.titleParams.tournamentName,
					imageUrl: room.imageUrl ?? `${navIconUrl("medal")}.avif`,
				};
			}
			case "TOURNAMENT_TEAM": {
				return {
					title: room.titleParams.teamName,
					subtitle: room.titleParams.tournamentName,
					imageUrl: room.imageUrl ?? `${navIconUrl("medal")}.avif`,
				};
			}
			case "SCRIM": {
				return {
					title: dateFormatter.format(
						databaseTimestampToDate(Number(room.titleParams.startsAt)),
					),
					subtitle: t("common:chat.room.scrim"),
					imageUrl: `${navIconUrl("scrims")}.avif`,
				};
			}
		}
	};
}

/** Concise label for split view headers, e.g. "Match" / "Group". */
function roomShortLabel(room: ChatRoomListItem, t: TFunction<["common"]>) {
	return room.type === "SQ_GROUP"
		? t("common:chat.room.groupShort")
		: t("common:chat.room.matchShort");
}

function roomIsInactive(room: ChatRoomListItem) {
	return room.inactive || room.expiresAt <= dateToDatabaseTimestamp(new Date());
}

function SidebarHeader({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.sidebarHeader}>
			<NavIconContainer>
				<MessageSquare size={18} />
			</NavIconContainer>
			<h2>{t("common:chat.sidebar.title")}</h2>
			{onClose ? (
				<Button className={styles.closeButton} onPress={onClose}>
					<X size={18} />
				</Button>
			) : null}
		</div>
	);
}

function LoadingState({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.sidebar}>
			<SidebarHeader onClose={onClose} />
			<div className={styles.roomList}>
				<div className={styles.emptyState}>{t("common:chat.connecting")}</div>
			</div>
		</div>
	);
}

function RoomList({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext()!;
	const [showInactive, setShowInactive] = React.useState(false);

	const routeRoomIds = useCurrentRouteChatRoomIds();
	const routeReadOnlyRooms = useCurrentRouteReadOnlyChatRooms();

	const byRecency = (a: ChatRoomListItem, b: ChatRoomListItem) =>
		(b.latestMessageAt ?? 0) - (a.latestMessageAt ?? 0) || b.id - a.id;

	const routeRooms = routeRoomIds
		.map((roomId) => chatContext.roomForId(roomId))
		.filter((r): r is ChatRoomListItem => Boolean(r));

	// Rooms the active route groups together collapse into a single combined
	// list entry that opens the stacked split view.
	const combinedRooms = routeRooms.length > 1 ? routeRooms : [];
	const isCombined = combinedRooms.length > 1;
	const combinedRoomIds = new Set(combinedRooms.map((r) => r.id));

	// an observer's route room lives outside the user's own list; surface it on top
	const observedRouteRoom =
		!isCombined &&
		routeRooms.length === 1 &&
		chatContext.rooms.every((room) => room.id !== routeRooms[0].id)
			? routeRooms[0]
			: null;

	// rooms the route lets the viewer read but not write (staff reading the group
	// chats of a match), each opened on its own
	const readOnlyRooms = routeReadOnlyRooms.flatMap((entry) => {
		const room = chatContext.roomForId(entry.roomId);
		if (!room || chatContext.rooms.some((own) => own.id === room.id)) return [];

		return [{ room, label: entry.label }];
	});

	const standaloneRooms = chatContext.rooms.filter(
		(room) => !combinedRoomIds.has(room.id),
	);
	const activeRooms = standaloneRooms
		.filter((room) => !roomIsInactive(room))
		.sort(byRecency);
	const inactiveRooms = standaloneRooms
		.filter((room) => roomIsInactive(room))
		.sort(byRecency);

	const openRooms = (roomIds: number[]) => {
		for (const roomId of roomIds) {
			chatContext.ensureMessagesLoaded(roomId);
			chatContext.markAsRead(roomId);
		}
		chatContext.setActiveRoomIds(roomIds);
	};

	const hasAnyRoom =
		isCombined ||
		observedRouteRoom !== null ||
		readOnlyRooms.length > 0 ||
		standaloneRooms.length > 0;

	return (
		<div className={styles.sidebar}>
			<SidebarHeader onClose={onClose} />
			<div className={styles.roomList}>
				{!hasAnyRoom ? (
					<div className={styles.emptyState}>
						{t("common:chat.sidebar.noActiveChats")}
					</div>
				) : (
					<>
						{isCombined ? (
							<CombinedRoomListItem
								rooms={combinedRooms}
								onPress={() => openRooms(combinedRooms.map((room) => room.id))}
							/>
						) : null}
						{observedRouteRoom ? (
							<RoomListItem
								room={observedRouteRoom}
								onPress={() => openRooms([observedRouteRoom.id])}
							/>
						) : null}
						{readOnlyRooms.map(({ room, label }) => (
							<RoomListItem
								key={room.id}
								room={room}
								subtitle={label}
								onPress={() => openRooms([room.id])}
							/>
						))}
						{activeRooms.map((room) => (
							<RoomListItem
								key={room.id}
								room={room}
								onPress={() => openRooms([room.id])}
							/>
						))}
						{inactiveRooms.length > 0 ? (
							<>
								<Button
									className={styles.inactiveToggle}
									onPress={() => setShowInactive((shown) => !shown)}
								>
									{showInactive ? (
										<ChevronDown size={14} />
									) : (
										<ChevronRight size={14} />
									)}
									{t("common:chat.sidebar.inactive")} ({inactiveRooms.length})
								</Button>
								{showInactive
									? inactiveRooms.map((room) => (
											<RoomListItem
												key={room.id}
												room={room}
												inactive
												onPress={() => openRooms([room.id])}
											/>
										))
									: null}
							</>
						) : null}
					</>
				)}
			</div>
		</div>
	);
}

function RoomListItem({
	room,
	inactive = false,
	subtitle: subtitleOverride,
	onPress,
}: {
	room: ChatRoomListItem;
	inactive?: boolean;
	/** Names the room in place of its own subtitle, where that can't tell it apart. */
	subtitle?: string;
	onPress: () => void;
}) {
	const roomDisplay = useRoomDisplay();
	const { formatter: timestampFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});

	const { title, subtitle: roomSubtitle, imageUrl } = roomDisplay(room);
	const subtitle = subtitleOverride ?? roomSubtitle;

	return (
		<NavListButton
			className={clsx(styles.roomItem, inactive ? "opaque" : null)}
			onPress={onPress}
		>
			<NavListImage src={imageUrl} />
			<NavListTexts>
				<NavListTitle className={styles.roomName}>{title}</NavListTitle>
				<NavListSubtitle>{subtitle}</NavListSubtitle>
			</NavListTexts>
			{room.unreadCount > 0 ? (
				<span className={styles.unreadBadge}>{room.unreadCount}</span>
			) : room.latestMessageAt !== null ? (
				<span className={styles.roomTimestamp}>
					{timestampFormatter.format(
						databaseTimestampToDate(room.latestMessageAt),
					)}
				</span>
			) : null}
		</NavListButton>
	);
}

function CombinedRoomListItem({
	rooms,
	onPress,
}: {
	rooms: ChatRoomListItem[];
	onPress: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const roomDisplay = useRoomDisplay();

	const primary = rooms[0];
	const { title, imageUrl } = roomDisplay(primary);
	const unread = rooms.reduce((sum, room) => sum + room.unreadCount, 0);

	return (
		<NavListButton className={styles.roomItem} onPress={onPress}>
			<NavListImage src={imageUrl} />
			<NavListTexts>
				<NavListTitle className={styles.roomName}>{title}</NavListTitle>
				<NavListSubtitle>
					{rooms.map((room) => roomShortLabel(room, t)).join(" · ")}
				</NavListSubtitle>
			</NavListTexts>
			{unread > 0 ? <span className={styles.unreadBadge}>{unread}</span> : null}
		</NavListButton>
	);
}

function ChatView({ onClose }: { onClose?: () => void }) {
	const chatContext = useChatContext()!;

	const activeRooms = chatContext.activeRoomIds
		.map((roomId) => chatContext.roomForId(roomId))
		.filter((r): r is ChatRoomListItem => Boolean(r));

	if (activeRooms.length > 1) {
		return <CombinedChatView rooms={activeRooms} onClose={onClose} />;
	}

	return <SingleChatView room={activeRooms[0]} onClose={onClose} />;
}

function SingleChatView({
	room,
	onClose,
}: {
	room: ChatRoomListItem | undefined;
	onClose?: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext()!;
	const roomDisplay = useRoomDisplay();
	const readOnlyLabel = useCurrentRouteReadOnlyChatRooms().find(
		(entry) => entry.roomId === room?.id,
	)?.label;

	const otherRoomsUnreadCount = chatContext.rooms
		.filter((candidate) => candidate.id !== room?.id)
		.reduce((sum, candidate) => sum + candidate.unreadCount, 0);

	const display = room ? roomDisplay(room) : null;
	const subtitle = readOnlyLabel ?? display?.subtitle;

	const headerContent = (
		<>
			{display ? <NavListImage src={display.imageUrl} /> : null}
			<div className={styles.chatHeaderInfo}>
				<span className={styles.chatHeaderTitle}>
					{display?.title ?? t("common:chat.sidebar.title")}
				</span>
				{subtitle ? (
					<span className={styles.chatHeaderSubtitle}>{subtitle}</span>
				) : null}
			</div>
		</>
	);

	return (
		<div className={styles.sidebar}>
			<div className={styles.chatHeader}>
				<Button
					className={styles.backButton}
					onPress={() => chatContext.setActiveRoomIds([])}
				>
					<ArrowLeft size={18} />
					{otherRoomsUnreadCount > 0 ? (
						<span className={styles.backButtonBadge}>
							{otherRoomsUnreadCount}
						</span>
					) : null}
				</Button>
				{room?.url ? (
					<Link to={room.url} className={styles.chatHeaderLink}>
						{headerContent}
					</Link>
				) : (
					<div className={styles.chatHeaderLink}>{headerContent}</div>
				)}
				{onClose ? (
					<Button className={styles.closeButton} onPress={onClose}>
						<X size={18} />
					</Button>
				) : null}
			</div>
			<div className={styles.chatContainer}>
				{room ? <RoomChat room={room} /> : null}
			</div>
		</div>
	);
}

function CombinedChatView({
	rooms,
	onClose,
}: {
	rooms: ChatRoomListItem[];
	onClose?: () => void;
}) {
	const chatContext = useChatContext()!;
	const roomDisplay = useRoomDisplay();
	const isMobile = useLayoutSize() === "mobile";

	const primary = rooms[0];
	const display = roomDisplay(primary);
	const headerContent = (
		<>
			<NavListImage src={display.imageUrl} />
			<div className={styles.chatHeaderInfo}>
				<span className={styles.chatHeaderTitle}>{display.title}</span>
				{display.subtitle ? (
					<span className={styles.chatHeaderSubtitle}>{display.subtitle}</span>
				) : null}
			</div>
		</>
	);

	// Primary (match) sits on top, flush below the main header which already names
	// it, so its sub-header is hidden. Desktop splits evenly; mobile gives the
	// match chat the larger 3/5 share (group chat 2/5).
	const panels = [
		{ room: primary, grow: isMobile ? 3 : 1, showHeader: false },
		...rooms.slice(1).map((room) => ({
			room,
			grow: isMobile ? 2 : 1,
			showHeader: true,
		})),
	];

	return (
		<div className={styles.sidebar}>
			<div className={styles.chatHeader}>
				<Button
					className={styles.backButton}
					onPress={() => chatContext.setActiveRoomIds([])}
				>
					<ArrowLeft size={18} />
				</Button>
				{primary.url ? (
					<Link to={primary.url} className={styles.chatHeaderLink}>
						{headerContent}
					</Link>
				) : (
					<div className={styles.chatHeaderLink}>{headerContent}</div>
				)}
				{onClose ? (
					<Button className={styles.closeButton} onPress={onClose}>
						<X size={18} />
					</Button>
				) : null}
			</div>
			<div className={styles.splitView}>
				{panels.map(({ room, grow, showHeader }) => (
					<SplitPanel
						key={room.id}
						room={room}
						grow={grow}
						showHeader={showHeader}
					/>
				))}
			</div>
		</div>
	);
}

function SplitPanel({
	room,
	grow,
	showHeader,
}: {
	room: ChatRoomListItem;
	grow: number;
	showHeader: boolean;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div
			className={styles.splitPanel}
			style={{ "--split-grow": grow } as React.CSSProperties}
		>
			{showHeader ? (
				<div className={styles.splitPanelHeader}>{roomShortLabel(room, t)}</div>
			) : null}
			<div className={styles.chatContainer}>
				<RoomChat room={room} />
			</div>
		</div>
	);
}

function RoomChat({ room }: { room: ChatRoomListItem }) {
	const chatContext = useChatContext()!;

	const expired = room.expiresAt <= dateToDatabaseTimestamp(new Date());

	return (
		<Chat
			messages={chatContext.messagesForRoom(room.id)}
			onSend={(message) => chatContext.sendMessage(room.id, message)}
			labelByUserId={room.labelByUserId}
			disabled={expired}
			readOnly={!expired && !room.canPost}
		/>
	);
}
