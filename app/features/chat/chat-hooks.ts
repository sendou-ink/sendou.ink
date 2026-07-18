import * as React from "react";
import { useUser } from "../auth/core/user";
import type { ChatMessage } from "./chat-types";
import { useChatContext } from "./useChatContext";

// increasing this = scrolling happens even when scrolled more upwards
const THRESHOLD = 100;
// how long after wheel/touch/keyboard input a scroll event still counts as user-initiated
const USER_SCROLL_INTENT_MS = 150;

export function useChatAutoScroll(
	messages: ChatMessage[],
	ref: React.RefObject<HTMLElement | null>,
) {
	const user = useUser();
	const [unseenMessages, setUnseenMessages] = React.useState(false);
	const pinnedToBottomRef = React.useRef(true);
	const lastUserScrollIntentRef = React.useRef(Number.NEGATIVE_INFINITY);
	const isPointerDownRef = React.useRef(false);
	const lastStableScrollTopRef = React.useRef(0);

	const scrollToBottom = React.useCallback(() => {
		const messagesContainer = ref.current;
		if (!messagesContainer) return;

		pinnedToBottomRef.current = true;
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
		setUnseenMessages(false);
	}, [ref]);

	React.useEffect(() => {
		const messagesContainer = ref.current!;

		function markUserScrollIntent() {
			lastUserScrollIntentRef.current = performance.now();
		}
		function handlePointerDown() {
			isPointerDownRef.current = true;
		}
		function handlePointerUp() {
			isPointerDownRef.current = false;
		}

		function handleScroll() {
			const isUserScroll =
				isPointerDownRef.current ||
				performance.now() - lastUserScrollIntentRef.current <
					USER_SCROLL_INTENT_MS;
			const isScrolledToBottom =
				messagesContainer.scrollTop + messagesContainer.clientHeight >=
				messagesContainer.scrollHeight - THRESHOLD;

			// react-aria's Virtualizer resets the scroll position to the top
			// whenever the message collection changes; undo those resets so
			// they neither unpin the auto scroll nor yank the user out of the
			// history they were reading
			if (!isUserScroll) {
				if (pinnedToBottomRef.current && !isScrolledToBottom) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
					return;
				}
				if (
					!pinnedToBottomRef.current &&
					messagesContainer.scrollTop === 0 &&
					lastStableScrollTopRef.current > 0
				) {
					messagesContainer.scrollTop = lastStableScrollTopRef.current;
					return;
				}
			}

			pinnedToBottomRef.current = isScrolledToBottom;
			lastStableScrollTopRef.current = messagesContainer.scrollTop;
			if (isScrolledToBottom) {
				setUnseenMessages(false);
			}
		}

		messagesContainer.addEventListener("wheel", markUserScrollIntent, {
			passive: true,
		});
		messagesContainer.addEventListener("touchmove", markUserScrollIntent, {
			passive: true,
		});
		messagesContainer.addEventListener("keydown", markUserScrollIntent);
		messagesContainer.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("pointerup", handlePointerUp);
		messagesContainer.addEventListener("scroll", handleScroll);

		return () => {
			messagesContainer.removeEventListener("wheel", markUserScrollIntent);
			messagesContainer.removeEventListener("touchmove", markUserScrollIntent);
			messagesContainer.removeEventListener("keydown", markUserScrollIntent);
			messagesContainer.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("pointerup", handlePointerUp);
			messagesContainer.removeEventListener("scroll", handleScroll);
		};
	}, [ref]);

	const hasMessages = messages.length > 0;

	// the virtualizer resizes the scrollable content asynchronously as it
	// measures rows, without scroll events firing, so keep the view glued to
	// the bottom whenever the content height changes while pinned there
	React.useEffect(() => {
		if (!hasMessages) return;

		const messagesContainer = ref.current!;
		const scrollContent = messagesContainer.firstElementChild;
		if (!scrollContent) return;

		const observer = new ResizeObserver(() => {
			if (pinnedToBottomRef.current) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		});
		observer.observe(scrollContent);

		return () => observer.disconnect();
	}, [ref, hasMessages]);

	React.useEffect(() => {
		if (messages.length === 0) return;

		const latestMessageIsOwn =
			user != null && messages[messages.length - 1]?.userId === user.id;

		if (latestMessageIsOwn || pinnedToBottomRef.current) {
			scrollToBottom();
		} else {
			setUnseenMessages(true);
		}
	}, [messages, user, scrollToBottom]);

	const reset = () => {
		pinnedToBottomRef.current = true;
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
