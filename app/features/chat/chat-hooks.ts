import * as React from "react";
import { useUser } from "../auth/core/user";
import type { ChatMessage } from "./chat-types";
import { useChatContext } from "./useChatContext";

// increasing this = scrolling happens even when scrolled more upwards
const THRESHOLD = 100;

export function useChatAutoScroll(
	messages: ChatMessage[],
	ref: React.RefObject<HTMLOListElement | null>,
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

/**
 * Subscribes the page to a Skalop topic over the shared chat WebSocket so that
 * `revalidateOnly` broadcasts to the topic trigger a data loader revalidation.
 * Topics are lightweight: no metadata, no participants, no history — purely a
 * fan-out channel. Pass `connected=false` to opt out (e.g. once a tournament
 * has been finalized and no further updates are expected).
 */
export function useWebsocketRevalidation(topic: string, connected = true) {
	const chat = useChatContext();
	const subscribeTopic = chat?.subscribeTopic;
	const unsubscribeTopic = chat?.unsubscribeTopic;
	const readyState = chat?.readyState;

	React.useEffect(() => {
		if (!connected || readyState !== "CONNECTED") return;
		if (!subscribeTopic || !unsubscribeTopic) return;

		subscribeTopic(topic);
		return () => unsubscribeTopic(topic);
	}, [topic, connected, readyState, subscribeTopic, unsubscribeTopic]);
}
