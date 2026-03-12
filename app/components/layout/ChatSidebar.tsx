import { ArrowLeft, MessageSquare, X } from "lucide-react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Chat } from "~/features/chat/components/Chat";
import { useChatContext } from "~/features/chat/useChatContext";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import styles from "./ChatSidebar.module.css";

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
	const chatContext = useChatContext();

	if (!chatContext) return null;

	if (chatContext.activeRoom) {
		return <ChatView onClose={onClose} />;
	}

	return <RoomList onClose={onClose} />;
}

function RoomList({ onClose }: { onClose?: () => void }) {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext()!;
	const { formatDateTime } = useTimeFormat();

	const nonExpiredRooms = chatContext.rooms.filter(
		(room) => room.expiresAt > Date.now(),
	);

	return (
		<div className={styles.sidebar}>
			<div className={styles.sidebarHeader}>
				<MessageSquare size={18} />
				<h2>{t("common:chat.sidebar.title")}</h2>
				{onClose ? (
					<Button className={styles.closeButton} onPress={onClose}>
						<X size={18} />
					</Button>
				) : null}
			</div>
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
								className={styles.roomItem}
								onPress={() => {
									chatContext.requestHistory(room.chatCode);
									chatContext.setActiveRoom(room.chatCode);
									chatContext.markAsRead(room.chatCode);
								}}
							>
								<div className={styles.roomInfo}>
									<span className={styles.roomName}>{room.header}</span>
									<span className={styles.roomLastMessage}>
										{room.subtitle}
									</span>
								</div>
								{unread > 0 ? (
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
	const chatContext = useChatContext()!;
	const activeRoom = chatContext.activeRoom!;

	const room = chatContext.rooms.find((r) => r.chatCode === activeRoom);
	const messages = chatContext.messagesForRoom(activeRoom);

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
			<span className={styles.chatHeaderTitle}>
				{room?.header ?? activeRoom}
			</span>
			{room?.subtitle ? (
				<span className={styles.chatHeaderSubtitle}>{room.subtitle}</span>
			) : null}
		</>
	);

	return (
		<div className={styles.sidebar}>
			<div className={styles.chatHeader}>
				<Button className={styles.backButton} onPress={handleBack}>
					<ArrowLeft size={18} />
				</Button>
				{room?.url ? (
					<Link to={room.url} className={styles.chatHeaderLink}>
						{headerContent}
					</Link>
				) : (
					<div className={styles.chatHeaderInfo}>{headerContent}</div>
				)}
				{onClose ? (
					<Button className={styles.closeButton} onPress={onClose}>
						<X size={18} />
					</Button>
				) : null}
			</div>
			<div className={styles.chatContainer}>
				<Chat
					users={chatContext.chatUsers}
					rooms={[
						{
							label: room?.header ?? "Chat",
							code: activeRoom,
						},
					]}
					chat={chatAdapter}
				/>
			</div>
		</div>
	);
}
