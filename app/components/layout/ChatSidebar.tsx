import clsx from "clsx";
import { ArrowLeft, MessageSquare, X } from "lucide-react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { resolveDatePlaceholders } from "~/features/chat/chat-utils";
import { Chat } from "~/features/chat/components/Chat";
import { useChatContext } from "~/features/chat/useChatContext";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import sideNavStyles from "../SideNav.module.css";
import styles from "./ChatSidebar.module.css";

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
	const chatContext = useChatContext();

	if (!chatContext) return null;

	if (chatContext.activeRoom) {
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
	const { formatDateTime } = useTimeFormat();

	const nonExpiredRooms = chatContext.rooms
		.filter((room) => room.expiresAt > Date.now())
		.sort((a, b) => {
			if (a.isObsolete !== b.isObsolete) return a.isObsolete ? 1 : -1;
			const aRecency = a.lastMessageTimestamp || a.createdAt;
			const bRecency = b.lastMessageTimestamp || b.createdAt;
			return bRecency - aRecency;
		});

	return (
		<div className={styles.sidebar}>
			<SidebarHeader onClose={onClose} />
			<div className={styles.roomList}>
				{nonExpiredRooms.length === 0 ? (
					<div className={styles.emptyState}>
						{t("common:chat.sidebar.noActiveChats")}
					</div>
				) : (
					nonExpiredRooms.map((room) => {
						const unread = chatContext.unreadCounts[room.chatCode] ?? 0;

						return (
							<Button
								key={room.chatCode}
								className={clsx(
									sideNavStyles.listButton,
									styles.roomItem,
									room.isObsolete ? "opaque" : null,
								)}
								onPress={() => {
									chatContext.requestHistory(room.chatCode);
									chatContext.setActiveRoom(room.chatCode);
									chatContext.markAsRead(room.chatCode);
								}}
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
										{resolveDatePlaceholders(room.header, (d) =>
											formatDateTime(d, {
												month: "short",
												day: "numeric",
												hour: "numeric",
												minute: "numeric",
											}),
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
										{formatDateTime(new Date(room.lastMessageTimestamp), {
											hour: "numeric",
											minute: "numeric",
										})}
									</span>
								) : null}
							</Button>
						);
					})
				)}
			</div>
		</div>
	);
}

function ChatView({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext()!;
	const activeRoom = chatContext.activeRoom!;
	const { formatDateTime } = useTimeFormat();

	const otherRoomsUnreadCount = Object.entries(chatContext.unreadCounts)
		.filter(([code]) => code !== activeRoom)
		.reduce((sum, [, count]) => sum + count, 0);

	const room = chatContext.rooms.find((r) => r.chatCode === activeRoom);
	const roomExpired = Boolean(room?.expiresAt && room.expiresAt < Date.now());
	const messages = chatContext.messagesForRoom(activeRoom);

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

	const chatAdapter = {
		messages,
		send: (contents: string) => chatContext.send(activeRoom, contents),
		currentRoom: activeRoom,
		setCurrentRoom: () => {},
		readyState: chatContext.readyState,
		unseenMessages: new Map<string, number>(),
	};

	const handleBack = () => {
		chatContext.setActiveRoom(null);
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
						(d) =>
							formatDateTime(d, {
								month: "short",
								day: "numeric",
								hour: "numeric",
								minute: "numeric",
							}),
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
