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
	useCurrentRouteChatRooms,
} from "~/features/chat/ChatProvider";
import type { ChatRoomListItem } from "~/features/chat/chat-types";
import { Chat } from "~/features/chat/components/Chat";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
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

	const byRecency = (a: ChatRoomListItem, b: ChatRoomListItem) =>
		(b.latestMessageAt ?? 0) - (a.latestMessageAt ?? 0) || b.id - a.id;

	const routeRooms = useCurrentRouteChatRooms().flatMap((entry) => {
		const room = chatContext.roomForId(entry.roomId);
		return room ? [{ ...entry, room }] : [];
	});

	// rooms the active route opens together collapse into one entry opening the stacked split view
	const autoOpenRooms = routeRooms.filter((entry) => entry.autoOpen);
	const combinedRooms = autoOpenRooms.length > 1 ? autoOpenRooms : [];
	const combinedRoomIds = new Set(combinedRooms.map((entry) => entry.room.id));

	// route rooms outside the user's own list (an observer's match chat, the
	// group chats a staff member may read) are surfaced on top of it
	const pinnedRooms = routeRooms.filter(
		(entry) =>
			!combinedRoomIds.has(entry.room.id) &&
			chatContext.rooms.every((own) => own.id !== entry.room.id),
	);

	const standaloneRooms = chatContext.rooms.filter(
		(room) => !combinedRoomIds.has(room.id),
	);
	// an inactive room that got a new message surfaces in the normal list until read
	const activeRooms = standaloneRooms
		.filter((room) => !roomIsInactive(room) || room.unreadCount > 0)
		.sort(byRecency);
	const inactiveRooms = standaloneRooms
		.filter((room) => roomIsInactive(room) && room.unreadCount === 0)
		.sort(byRecency);

	const openRooms = (roomIds: number[]) => {
		for (const roomId of roomIds) {
			chatContext.ensureMessagesLoaded(roomId);
			chatContext.markAsRead(roomId);
		}
		chatContext.setActiveRoomIds(roomIds);
	};

	const hasAnyRoom =
		combinedRooms.length > 0 ||
		pinnedRooms.length > 0 ||
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
						{combinedRooms.length > 0 ? (
							<CombinedRoomListItem
								rooms={combinedRooms.map((entry) => entry.room)}
								onPress={() =>
									openRooms(combinedRooms.map((entry) => entry.room.id))
								}
							/>
						) : null}
						{pinnedRooms.map(({ room, label }) => (
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
	const routeLabel = useCurrentRouteChatRooms().find(
		(entry) => entry.roomId === room?.id,
	)?.label;

	const otherRoomsUnreadCount = chatContext.rooms
		.filter((candidate) => candidate.id !== room?.id)
		.reduce((sum, candidate) => sum + candidate.unreadCount, 0);

	const display = room ? roomDisplay(room) : null;
	const subtitle = routeLabel ?? display?.subtitle;

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
				{/* keyed so switching rooms starts the scroller and its unseen state over */}
				{room ? <RoomChat key={room.id} room={room} /> : null}
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
				{rooms.map((room, index) => (
					<SplitPanel key={room.id} room={room} showHeader={index > 0} />
				))}
			</div>
		</div>
	);
}

/** The primary (match) room sits on top with its sub-header hidden, the main header already names it. */
function SplitPanel({
	room,
	showHeader,
}: {
	room: ChatRoomListItem;
	showHeader: boolean;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.splitPanel}>
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
