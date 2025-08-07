import { useRevalidator } from "@remix-run/react";
import { nanoid } from "nanoid";
import { WebSocket } from "partysocket";
import React from "react";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { soundPath } from "~/utils/urls";
import { useUser } from "../auth/core/user";
import type { ChatMessage, ChatProps } from "./chat-types";
import { messageTypeToSound, soundEnabled, soundVolume } from "./chat-utils";

// increasing this = scrolling happens even when scrolled more upwards
const THRESHOLD = 100;

export function useChatAutoScroll(
	messages: ChatMessage[],
	ref: React.RefObject<HTMLOListElement>,
) {
	const user = useUser();
	const [firstLoadHandled, setFirstLoadHandled] = React.useState(false);
	const [unseenMessages, setUnseenMessages] = React.useState(false);

	React.useEffect(() => {
		const messagesContainer = ref.current!;
		const isScrolledToBottom =
			Math.abs(
				messagesContainer.scrollHeight -
					messagesContainer.clientHeight -
					messagesContainer.scrollTop,
			) <= THRESHOLD;
		const latestMessageIsOwn =
			messages[messages.length - 1]?.userId === user?.id;

		// lets wait for messages to load first
		if (!firstLoadHandled && messages.length === 0) return;

		if (isScrolledToBottom || latestMessageIsOwn || !firstLoadHandled) {
			setFirstLoadHandled(true);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		} else if (!isScrolledToBottom) {
			setUnseenMessages(true);
		}
	}, [messages, ref, user, firstLoadHandled]);

	React.useEffect(() => {
		const messagesContainer = ref.current!;

		function handleScroll() {
			if (
				messagesContainer.scrollTop + messagesContainer.clientHeight >=
				messagesContainer.scrollHeight - THRESHOLD
			) {
				setUnseenMessages(false);
			}
		}

		messagesContainer.addEventListener("scroll", handleScroll);

		return () => {
			messagesContainer.removeEventListener("scroll", handleScroll);
		};
	}, [ref]);

	const scrollToBottom = () => {
		ref.current!.scrollTop = ref.current!.scrollHeight;
	};

	const reset = () => {
		setFirstLoadHandled(false);
		setUnseenMessages(false);
	};

	return {
		unseenMessagesInTheRoom: unseenMessages,
		resetScroller: reset,
		scrollToBottom,
	};
}

// TODO: should contain unseen messages logic, now it's duplicated
export function useChat({
	rooms,
	onNewMessage,
	revalidates = true,
	connected = true,
}: {
	/** Which chat rooms to join. */
	rooms: ChatProps["rooms"];
	/** Callback function when a new chat message is received. Note: not fired for system messages. */
	onNewMessage?: (message: ChatMessage) => void;
	/** If false, skips revalidating on new message. Can be used if more fine grained control is needed regarding when the revalidation happens to e.g. preserve local state. Defaults to true.  */
	revalidates?: boolean;
	/** If true, the chat is connected to the server. Defaults to true.  */
	connected?: boolean;
}) {
	const { revalidate } = useRevalidator();
	const shouldRevalidate = React.useRef<boolean>();
	const user = useUser();

	const [messages, setMessages] = React.useState<ChatMessage[]>([]);
	const [readyState, setReadyState] = React.useState<
		"CONNECTING" | "CONNECTED" | "CLOSED"
	>("CONNECTING");
	const [sentMessage, setSentMessage] = React.useState<ChatMessage>();
	const [currentRoom, setCurrentRoom] = React.useState<string | undefined>(
		rooms[0]?.code,
	);

	const ws = React.useRef<WebSocket>();
	const lastSeenMessagesByRoomId = React.useRef<Map<string, string>>(new Map());

	// same principal as here behind separating it into a ref: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
	React.useEffect(() => {
		shouldRevalidate.current = revalidates;
	}, [revalidates]);

	React.useEffect(() => {
		if (rooms.length === 0 || !connected) return;
		if (!import.meta.env.VITE_SKALOP_WS_URL) {
			logger.warn("No WS URL provided");
			return;
		}

		const url = `${import.meta.env.VITE_SKALOP_WS_URL}?${rooms
			.map((room) => `room=${room.code}`)
			.join("&")}`;
		ws.current = new WebSocket(url, [], {
			maxReconnectionDelay: 10000 * 2,
			reconnectionDelayGrowFactor: 1.5,
		});
		ws.current.onopen = () => {
			setCurrentRoom(rooms[0].code);
			setReadyState("CONNECTED");
		};
		ws.current.onclose = () => setReadyState("CLOSED");
		ws.current.onerror = () => setReadyState("CLOSED");

		ws.current.onmessage = (e) => {
			const message = JSON.parse(e.data);
			const messageArr = (
				Array.isArray(message) ? message : [message]
			) as ChatMessage[];

			// something interesting happened
			// -> let's run data loaders so they can see it without needing to refresh the page
			const isSystemMessage = Boolean(messageArr[0].type);
			if (isSystemMessage && shouldRevalidate.current) {
				revalidate();
			}

			const sound = messageTypeToSound(messageArr[0].type);
			if (sound && soundEnabled(sound)) {
				const audio = new Audio(soundPath(sound));
				audio.volume = soundVolume() / 100;
				void audio
					.play()
					.catch((e) => logger.error(`Couldn't play sound: ${e}`));
			}

			if (messageArr[0].revalidateOnly) {
				return;
			}

			const isInitialLoad = Array.isArray(message);

			if (isInitialLoad) {
				lastSeenMessagesByRoomId.current = message.reduce((acc, cur) => {
					acc.set(cur.room, cur.id);
					return acc;
				}, new Map<string, string>());
			}

			if (isInitialLoad) {
				setMessages(messageArr);
			} else {
				if (!isSystemMessage) onNewMessage?.(message);
				setMessages((messages) => [...messages, ...messageArr]);
			}
		};

		const wsCurrent = ws.current;
		return () => {
			wsCurrent?.close();
			setMessages([]);
		};
	}, [rooms, onNewMessage, revalidate, connected]);

	React.useEffect(() => {
		// ping every minute to keep connection alive
		const interval = setInterval(() => {
			ws.current?.send("");
		}, 1000 * 60);

		return () => {
			clearInterval(interval);
		};
	}, []);

	const send = React.useCallback(
		(contents: string) => {
			invariant(currentRoom);

			const id = nanoid();
			setSentMessage({
				id,
				room: currentRoom,
				contents,
				timestamp: Date.now(),
				userId: user!.id,
			});
			ws.current!.send(JSON.stringify({ id, contents, room: currentRoom }));
		},
		[user, currentRoom],
	);

	let allMessages = messages;
	if (sentMessage && !messages.some((msg) => msg.id === sentMessage.id)) {
		allMessages = [...messages, { ...sentMessage, pending: true }];
	}

	const roomsMessages = allMessages
		.filter((msg) => msg.room === currentRoom)
		.sort((a, b) => a.timestamp - b.timestamp);
	if (roomsMessages.length > 0 && currentRoom) {
		lastSeenMessagesByRoomId.current.set(
			currentRoom,
			roomsMessages[roomsMessages.length - 1].id,
		);
	}

	const unseenMessages = unseenMessagesCountByRoomId({
		messages,
		lastSeenMessages: lastSeenMessagesByRoomId.current,
	});

	return {
		messages: roomsMessages,
		send,
		currentRoom,
		setCurrentRoom,
		readyState,
		unseenMessages,
	};
}

/** Listens to system messages sent via WebSocket to the given room triggering data loader revalidations. */
export function useWebsocketRevalidation({
	room,
	connected,
}: {
	room: string;
	/** If true, the websocket is connected. Defaults to true.  */
	connected?: boolean;
}) {
	const rooms = React.useMemo(() => [{ label: room, code: room }], [room]);

	useChat({
		rooms,
		connected,
	});
}

function unseenMessagesCountByRoomId({
	messages,
	lastSeenMessages,
}: {
	messages: ChatMessage[];
	lastSeenMessages: Map<string, string>;
}) {
	const lastUnseenEncountered = new Set<string>();

	const unseenMessages = messages.filter((msg) => {
		if (msg.id === lastSeenMessages.get(msg.room)) {
			lastUnseenEncountered.add(msg.room);
			return false;
		}

		return lastUnseenEncountered.has(msg.room);
	});

	return unseenMessages.reduce((acc, cur) => {
		const count = acc.get(cur.room) ?? 0;
		acc.set(cur.room, count + 1);
		return acc;
	}, new Map<string, number>());
}
