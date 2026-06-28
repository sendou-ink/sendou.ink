import clsx from "clsx";
import { ArrowLeft, MessageSquare, X } from "lucide-react";
import * as React from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useCurrentRouteChatCodes } from "~/features/chat/ChatProvider";
import type {
	ChatContextValue,
	RoomInfo,
} from "~/features/chat/chat-provider-types";
import { resolveDatePlaceholders } from "~/features/chat/chat-utils";
import { Chat } from "~/features/chat/components/Chat";
import { useChatContext } from "~/features/chat/useChatContext";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
import sideNavStyles from "../SideNav.module.css";
import styles from "./ChatSidebar.module.css";

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
	const chatContext = useChatContext();

	if (!chatContext) return null;

	if (chatContext.activeRooms.length > 0) {
		return <ChatView onClose={onClose} />;
	}

	if (chatContext.isLoading) {
		return <LoadingState onClose={onClose} />;
	}

	return <RoomList onClose={onClose} />;
}

function SidebarHeader({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.sidebarHeader}>
			<div className={sideNavStyles.iconContainer}>
				<MessageSquare size={18} />
			</div>
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
	const { formatter: headerFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});
	const { formatter: timestampFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});

	const routeChatCodes = useCurrentRouteChatCodes();

	const visibleRooms = chatContext.rooms
		.filter(
			(room) =>
				room.expiresAt > Date.now() || routeChatCodes.includes(room.chatCode),
		)
		.sort((a, b) => {
			if (a.isObsolete !== b.isObsolete) return a.isObsolete ? 1 : -1;
			const aRecency = a.lastMessageTimestamp || a.createdAt;
			const bRecency = b.lastMessageTimestamp || b.createdAt;
			return bRecency - aRecency;
		});

	// Rooms the active route groups together collapse into a single combined
	// list entry that opens the stacked/tabbed view.
	const combinedRooms =
		routeChatCodes.length > 1
			? routeChatCodes
					.map((code) => visibleRooms.find((r) => r.chatCode === code))
					.filter((r): r is RoomInfo => Boolean(r))
			: [];
	const isCombined = combinedRooms.length > 1;
	const combinedChatCodes = new Set(combinedRooms.map((r) => r.chatCode));
	const standaloneRooms = isCombined
		? visibleRooms.filter((room) => !combinedChatCodes.has(room.chatCode))
		: visibleRooms;

	const openRooms = (chatCodes: string[]) => {
		for (const chatCode of chatCodes) {
			chatContext.requestHistory(chatCode);
			chatContext.markAsRead(chatCode);
		}
		chatContext.setActiveRooms(chatCodes);
	};

	return (
		<div className={styles.sidebar}>
			<SidebarHeader onClose={onClose} />
			<div className={styles.roomList}>
				{!isCombined && standaloneRooms.length === 0 ? (
					<div className={styles.emptyState}>
						{t("common:chat.sidebar.noActiveChats")}
					</div>
				) : (
					<>
						{isCombined ? (
							<CombinedRoomListItem
								rooms={combinedRooms}
								onPress={() =>
									openRooms(combinedRooms.map((room) => room.chatCode))
								}
							/>
						) : null}
						{standaloneRooms.map((room) => {
							const unread = chatContext.unreadCounts[room.chatCode] ?? 0;

							return (
								<Button
									key={room.chatCode}
									className={clsx(
										sideNavStyles.listButton,
										styles.roomItem,
										room.isObsolete ? "opaque" : null,
									)}
									onPress={() => openRooms([room.chatCode])}
								>
									{room.imageUrl ? (
										<img
											src={room.imageUrl}
											alt=""
											className={sideNavStyles.listLinkImage}
										/>
									) : null}
									<div className={sideNavStyles.listLinkContent}>
										<span
											className={clsx(
												sideNavStyles.listLinkTitle,
												styles.roomName,
												room.isObsolete ? "line-through" : null,
											)}
										>
											{resolveDatePlaceholders(
												room.header,
												(d) => headerFormatter.format(d) ?? "",
											)}
										</span>
										<span className={sideNavStyles.listLinkSubtitle}>
											{room.subtitle}
										</span>
									</div>
									{unread > 0 && !room.isObsolete ? (
										<span className={styles.unreadBadge}>{unread}</span>
									) : room.lastMessageTimestamp > 0 ? (
										<span className={styles.roomTimestamp}>
											{timestampFormatter.format(
												new Date(room.lastMessageTimestamp),
											)}
										</span>
									) : null}
								</Button>
							);
						})}
					</>
				)}
			</div>
		</div>
	);
}

function CombinedRoomListItem({
	rooms,
	onPress,
}: {
	rooms: RoomInfo[];
	onPress: () => void;
}) {
	const chatContext = useChatContext()!;
	const { formatter: headerFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	const primary = rooms[0];
	const unread = rooms.reduce(
		(sum, room) => sum + (chatContext.unreadCounts[room.chatCode] ?? 0),
		0,
	);

	return (
		<Button
			className={clsx(sideNavStyles.listButton, styles.roomItem)}
			onPress={onPress}
		>
			{primary.imageUrl ? (
				<img
					src={primary.imageUrl}
					alt=""
					className={sideNavStyles.listLinkImage}
				/>
			) : null}
			<div className={sideNavStyles.listLinkContent}>
				<span className={clsx(sideNavStyles.listLinkTitle, styles.roomName)}>
					{resolveDatePlaceholders(
						primary.header,
						(d) => headerFormatter.format(d) ?? "",
					)}
				</span>
				<span className={sideNavStyles.listLinkSubtitle}>
					{rooms.map((room) => roomShortLabel(room.header)).join(" · ")}
				</span>
			</div>
			{unread > 0 ? <span className={styles.unreadBadge}>{unread}</span> : null}
		</Button>
	);
}

function ChatView({ onClose }: { onClose?: () => void }) {
	const chatContext = useChatContext()!;

	const activeRooms = chatContext.activeRooms
		.map((code) => chatContext.rooms.find((r) => r.chatCode === code))
		.filter((r): r is RoomInfo => Boolean(r));

	if (activeRooms.length > 1) {
		return <CombinedChatView rooms={activeRooms} onClose={onClose} />;
	}

	return <SingleChatView onClose={onClose} />;
}

function SingleChatView({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext()!;
	const activeRoom = chatContext.activeRooms[0];
	const { formatter: headerFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	const routeChatCodes = useCurrentRouteChatCodes();

	// Mirror the room list's badge visibility (RoomList): only rooms that are
	// visible (non-expired or in route) and not obsolete contribute, so the
	// back-arrow total can't outrun what the list can actually show.
	const otherRoomsUnreadCount = chatContext.rooms
		.filter(
			(room) =>
				room.chatCode !== activeRoom &&
				!room.isObsolete &&
				(room.expiresAt > Date.now() || routeChatCodes.includes(room.chatCode)),
		)
		.reduce(
			(sum, room) => sum + (chatContext.unreadCounts[room.chatCode] ?? 0),
			0,
		);

	const room = chatContext.rooms.find((r) => r.chatCode === activeRoom);
	const roomExpired = Boolean(room?.expiresAt && room.expiresAt < Date.now());
	const messages = chatContext.messagesForRoom(activeRoom);

	const usersWithLabels = roomUsersWithLabels(chatContext, room);

	const chatAdapter = {
		messages,
		send: (contents: string) => {
			chatContext.send(activeRoom, contents);
		},
		currentRoom: activeRoom,
		setCurrentRoom: () => {},
		readyState: chatContext.readyState,
		unseenMessages: new Map<string, number>(),
	};

	const handleBack = () => {
		chatContext.setActiveRooms([]);
	};

	const headerContent = (
		<>
			{room?.imageUrl ? (
				<img
					src={room.imageUrl}
					alt=""
					className={sideNavStyles.listLinkImage}
				/>
			) : null}
			<div className={styles.chatHeaderInfo}>
				<span
					className={clsx(
						styles.chatHeaderTitle,
						room?.isObsolete ? "line-through" : null,
					)}
				>
					{resolveDatePlaceholders(
						room?.header ?? t("common:chat.sidebar.title"),
						(d) => headerFormatter.format(d) ?? "",
					)}
				</span>
				{room?.subtitle ? (
					<span className={styles.chatHeaderSubtitle}>{room.subtitle}</span>
				) : null}
			</div>
		</>
	);

	return (
		<div className={styles.sidebar}>
			<div className={styles.chatHeader}>
				<Button className={styles.backButton} onPress={handleBack}>
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
				<Chat
					users={usersWithLabels}
					rooms={[
						{
							label: room?.header ?? "Chat",
							code: activeRoom,
						},
					]}
					chat={chatAdapter}
					disabled={roomExpired}
				/>
			</div>
		</div>
	);
}

function CombinedChatView({
	rooms,
	onClose,
}: {
	rooms: RoomInfo[];
	onClose?: () => void;
}) {
	const chatContext = useChatContext()!;
	const { formatter: headerFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	const handleBack = () => {
		chatContext.setActiveRooms([]);
	};

	const primary = rooms[0];
	const headerContent = (
		<>
			{primary.imageUrl ? (
				<img
					src={primary.imageUrl}
					alt=""
					className={sideNavStyles.listLinkImage}
				/>
			) : null}
			<div className={styles.chatHeaderInfo}>
				<span className={styles.chatHeaderTitle}>
					{resolveDatePlaceholders(
						primary.header,
						(d) => headerFormatter.format(d) ?? "",
					)}
				</span>
				{primary.subtitle ? (
					<span className={styles.chatHeaderSubtitle}>{primary.subtitle}</span>
				) : null}
			</div>
		</>
	);

	return (
		<div className={styles.sidebar}>
			<div className={styles.chatHeader}>
				<Button className={styles.backButton} onPress={handleBack}>
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
			<SplitPanels rooms={rooms} />
		</div>
	);
}

function SplitPanels({ rooms }: { rooms: RoomInfo[] }) {
	const chatContext = useChatContext()!;
	const isMobile = useLayoutSize() === "mobile";

	// Both panels are on screen at once, so keep them all marked read while open,
	// re-running whenever any room's message count changes.
	const countsKey = rooms
		.map((r) => `${r.chatCode}:${r.totalMessageCount}`)
		.join(",");
	React.useEffect(() => {
		for (const entry of countsKey.split(",")) {
			chatContext.markAsRead(entry.split(":")[0]);
		}
	}, [countsKey, chatContext.markAsRead]);

	const [primary, ...rest] = rooms;
	// Primary (match) sits on top, flush below the main header which already names
	// it, so its sub-header is hidden. Desktop splits evenly; mobile gives the
	// match chat the larger 3/5 share (group chat 2/5).
	const panels = [
		{ room: primary, grow: isMobile ? 3 : 1, showHeader: false },
		...rest.map((room) => ({
			room,
			grow: isMobile ? 2 : 1,
			showHeader: true,
		})),
	];

	return (
		<div className={styles.splitView}>
			{panels.map(({ room, grow, showHeader }) => (
				<SplitPanel
					key={room.chatCode}
					room={room}
					grow={grow}
					showHeader={showHeader}
				/>
			))}
		</div>
	);
}

function SplitPanel({
	room,
	grow,
	showHeader,
}: {
	room: RoomInfo;
	grow: number;
	showHeader: boolean;
}) {
	return (
		<div
			className={styles.splitPanel}
			style={{ "--split-grow": grow } as React.CSSProperties}
		>
			{showHeader ? (
				<div className={styles.splitPanelHeader}>
					{roomShortLabel(room.header)}
				</div>
			) : null}
			<div className={styles.chatContainer}>
				<RoomChat room={room} />
			</div>
		</div>
	);
}

function RoomChat({ room }: { room: RoomInfo }) {
	const chatContext = useChatContext()!;
	const roomExpired = Boolean(room.expiresAt && room.expiresAt < Date.now());
	const usersWithLabels = roomUsersWithLabels(chatContext, room);

	const chatAdapter = {
		messages: chatContext.messagesForRoom(room.chatCode),
		send: (contents: string) => {
			chatContext.send(room.chatCode, contents);
		},
		currentRoom: room.chatCode,
		setCurrentRoom: () => {},
		readyState: chatContext.readyState,
		unseenMessages: new Map<string, number>(),
	};

	return (
		<Chat
			users={usersWithLabels}
			rooms={[{ label: room.header, code: room.chatCode }]}
			chat={chatAdapter}
			disabled={roomExpired}
		/>
	);
}

function roomUsersWithLabels(
	chatContext: ChatContextValue,
	room: RoomInfo | undefined,
) {
	const participantIds = new Set(room?.participantUserIds ?? []);
	const usersWithLabels = { ...chatContext.chatUsers };
	for (const [userIdStr, label] of Object.entries(chatContext.chatLabels)) {
		const userId = Number(userIdStr);
		if (participantIds.has(userId)) continue;
		const existing = usersWithLabels[userId];
		if (existing) {
			usersWithLabels[userId] = { ...existing, title: label };
		}
	}
	return usersWithLabels;
}

/** Concise label for tabs/split headers, e.g. "Match #123" -> "Match". */
function roomShortLabel(header: string): string {
	const trimmed = header.trim();
	if (!trimmed) return "Chat";
	return trimmed.split(/[\s(#]/)[0] || trimmed;
}
