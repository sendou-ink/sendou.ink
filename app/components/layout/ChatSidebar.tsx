import { ArrowLeft, MessageSquare, X } from "lucide-react";
import * as React from "react";
import { Button } from "react-aria-components";
import type { ChatMessage, ChatUser } from "~/features/chat/chat-types";
import { Chat } from "~/features/chat/components/Chat";
import { navIconUrl } from "~/utils/urls";
import styles from "./ChatSidebar.module.css";

const IMG_ROOT = "https://sendou.nyc3.cdn.digitaloceanspaces.com";
const SENDOUQ_ICON = `${navIconUrl("sendouq")}.png`;

interface MockRoom {
	name: string;
	lastMessage: string;
	timestamp: string;
	code: string;
	imageUrl: string;
	unreadCount?: number;
}

const MOCK_ROOMS: MockRoom[] = [
	{
		name: "SQ Match vs Team Alpha",
		lastMessage: "ggs, well played!",
		timestamp: "2 min ago",
		code: "sq-alpha",
		imageUrl: SENDOUQ_ICON,
		unreadCount: 3,
	},
	{
		name: "Low Ink March 2026",
		lastMessage: "Ready to start?",
		timestamp: "15 min ago",
		code: "tourney-low-ink",
		imageUrl: `${IMG_ROOT}/tournament-logo-zWk5C1kvQtEWrd7d2c_KS-1735836299376.webp`,
	},
	{
		name: "SQ Match vs Gamma Squad",
		lastMessage: "Let's run it back",
		timestamp: "1 hr ago",
		code: "sq-gamma",
		imageUrl: SENDOUQ_ICON,
	},
	{
		name: "Lunar Eclipse 56",
		lastMessage: "See you tomorrow",
		timestamp: "3 hrs ago",
		code: "tourney-lunar",
		imageUrl: `${IMG_ROOT}/tournament-logo-0oizUoMYLKQkc_EdyDkOT-1767636658472.webp`,
		unreadCount: 1,
	},
	{
		name: "Shark Tank: Shallow Waters #35",
		lastMessage: "Who's subbing?",
		timestamp: "5 hrs ago",
		code: "tourney-shark",
		imageUrl: `${IMG_ROOT}/tournament-logo-PyRNcRLpLMXBpO8j8Ho5W-1772403193067.webp`,
	},
];

export const MOCK_TOTAL_UNREAD = MOCK_ROOMS.reduce(
	(sum, room) => sum + (room.unreadCount ?? 0),
	0,
);

const MOCK_USERS: Record<number, ChatUser> = {
	1: {
		username: "Sendou",
		discordId: "79237403620945920",
		discordAvatar: null,
		pronouns: null,
		chatNameHue: "268",
	},
	2: {
		username: "N-ZAP",
		discordId: "455039198672453645",
		discordAvatar: null,
		pronouns: null,
		chatNameHue: "120",
	},
};

function mockMessagesForRoom(roomCode: string): ChatMessage[] {
	return [
		{
			id: `${roomCode}-1`,
			userId: 2,
			contents: "Hey, ready for the match?",
			timestamp: Date.now() - 120000,
			room: roomCode,
		},
		{
			id: `${roomCode}-2`,
			userId: 1,
			contents: "Yeah let's go!",
			timestamp: Date.now() - 60000,
			room: roomCode,
		},
		{
			id: `${roomCode}-3`,
			userId: 2,
			contents: "glhf",
			timestamp: Date.now(),
			room: roomCode,
		},
	];
}

export function ChatSidebar({ onClose }: { onClose?: () => void }) {
	const [activeRoom, setActiveRoom] = React.useState<MockRoom | null>(null);

	if (activeRoom) {
		return <ChatView room={activeRoom} onBack={() => setActiveRoom(null)} />;
	}

	return <RoomList onSelectRoom={setActiveRoom} onClose={onClose} />;
}

function RoomList({
	onSelectRoom,
	onClose,
}: {
	onSelectRoom: (room: MockRoom) => void;
	onClose?: () => void;
}) {
	return (
		<div className={styles.sidebar}>
			<div className={styles.sidebarHeader}>
				<MessageSquare size={18} />
				<h2>Chat</h2>
				{onClose ? (
					<Button className={styles.closeButton} onPress={onClose}>
						<X size={18} />
					</Button>
				) : null}
			</div>
			<div className={styles.roomList}>
				{MOCK_ROOMS.map((room) => (
					<Button
						key={room.code}
						className={styles.roomItem}
						onPress={() => onSelectRoom(room)}
					>
						<img src={room.imageUrl} alt="" className={styles.roomImage} />
						<div className={styles.roomInfo}>
							<span className={styles.roomName}>{room.name}</span>
							<span className={styles.roomLastMessage}>{room.lastMessage}</span>
						</div>
						{room.unreadCount ? (
							<span className={styles.unreadBadge}>{room.unreadCount}</span>
						) : (
							<span className={styles.roomTimestamp}>{room.timestamp}</span>
						)}
					</Button>
				))}
			</div>
		</div>
	);
}

function ChatView({ room, onBack }: { room: MockRoom; onBack: () => void }) {
	const messages = mockMessagesForRoom(room.code);

	const mockChat = {
		messages,
		send: () => {},
		currentRoom: room.code,
		setCurrentRoom: () => {},
		readyState: "CONNECTED" as const,
		unseenMessages: new Map<string, number>(),
	};

	return (
		<div className={styles.sidebar}>
			<div className={styles.chatHeader}>
				<Button className={styles.backButton} onPress={onBack}>
					<ArrowLeft size={18} />
				</Button>
				<img src={room.imageUrl} alt="" className={styles.chatHeaderImage} />
				<span className={styles.chatHeaderTitle}>{room.name}</span>
			</div>
			<div className={styles.chatContainer}>
				<Chat
					users={MOCK_USERS}
					rooms={[{ label: room.name, code: room.code }]}
					chat={mockChat}
					disabled
				/>
			</div>
		</div>
	);
}
