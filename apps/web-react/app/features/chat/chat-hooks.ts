import * as React from "react";
import { useRevalidator } from "react-router";
import { useUser } from "../auth/core/user";
import type { ChatContextValue } from "./chat-provider-types";
import type { ChatMessage } from "./chat-types";
import { scheduleBroadcastRevalidation } from "./revalidation-scope";
import { useChatContext } from "./useChatContext";

// increasing this = scrolling happens even when scrolled more upwards
const THRESHOLD = 100;
// how long the tab must have been hidden for returning to it to be worth a catch-up
const CATCH_UP_HIDDEN_MS = 20 * 1000;
// how often to catch up while the websocket is down and no broadcast can arrive
const WS_DOWN_CATCH_UP_MS = 2 * 60 * 1000;
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

	const latestMessage = messages.at(-1);
	const latestMessageId = latestMessage?.id;
	const latestMessageIsOwn = user != null && latestMessage?.userId === user.id;

	React.useEffect(() => {
		if (!latestMessageId) return;

		if (latestMessageIsOwn || pinnedToBottomRef.current) {
			scrollToBottom();
		} else {
			setUnseenMessages(true);
		}
	}, [latestMessageId, latestMessageIsOwn, scrollToBottom]);

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

	useLiveRevalidation(connected);

	React.useEffect(() => {
		if (!connected || readyState !== "CONNECTED") return;
		if (!subscribeTopic || !unsubscribeTopic) return;

		subscribeTopic(topic);
		return () => unsubscribeTopic(topic);
	}, [topic, connected, readyState, subscribeTopic, unsubscribeTopic]);
}

export function useLiveRevalidation(enabled = true) {
	const chat = useChatContext();
	const { revalidate } = useRevalidator();

	// a logged out visitor has no websocket to miss broadcasts from in the first place,
	// and revalidating for them would only add load
	const active = enabled && chat !== null;
	const readyState = chat?.readyState ?? "CLOSED";

	// goes through the broadcast scheduler so a catch-up shares its jitter (many clients
	// return to a page at once after a skalop deploy) and absorption into a broadcast
	// that is already scheduled
	const catchUp = React.useEffectEvent(() => {
		scheduleBroadcastRevalidation(revalidate, undefined);
	});

	// while inactive nothing can be missed, so the connect that follows counts as the first
	useRefreshOnReconnect(active ? readyState : "CLOSED", catchUp);

	React.useEffect(() => {
		if (!active) return;

		let hiddenAt: number | null = null;

		const handleVisibilityChange = () => {
			if (document.visibilityState !== "visible") {
				hiddenAt = Date.now();
				return;
			}

			// a quick tab away can not have missed anything the socket would not
			// still deliver, and revalidating for it would be pure server load
			if (hiddenAt !== null && Date.now() - hiddenAt >= CATCH_UP_HIDDEN_MS) {
				catchUp();
			}
			hiddenAt = null;
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [active]);

	React.useEffect(() => {
		if (!active || readyState === "CONNECTED") return;

		const interval = setInterval(catchUp, WS_DOWN_CATCH_UP_MS);
		return () => clearInterval(interval);
	}, [active, readyState]);
}

/**
 * Calls `onReconnect` every time the websocket comes back up, skipping the initial
 * connect: only what happened while the socket was down needs catching up on.
 */
export function useRefreshOnReconnect(
	readyState: ChatContextValue["readyState"],
	onReconnect: () => void,
) {
	const handleReconnect = React.useEffectEvent(onReconnect);
	const hasConnectedRef = React.useRef(false);

	React.useEffect(() => {
		if (readyState !== "CONNECTED") return;

		if (!hasConnectedRef.current) {
			hasConnectedRef.current = true;
			return;
		}

		handleReconnect();
	}, [readyState]);
}
