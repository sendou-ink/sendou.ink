import * as React from "react";
import { useRevalidator } from "react-router";
import {
	useEventStreamCatchUp,
	useEventsTopic,
	useServerEventListener,
} from "~/features/events/events-hooks";
import { useUser } from "../auth/core/user";
import type { ClientChatMessage } from "./chat-types";
import { playMessageSound } from "./chat-utils";
import {
	revalidateWithScope,
	scheduleBroadcastRevalidation,
} from "./revalidation-scope";

// increasing this = scrolling happens even when scrolled more upwards
const THRESHOLD = 100;
// how long after wheel/touch/keyboard input a scroll event still counts as user-initiated
const USER_SCROLL_INTENT_MS = 150;

export function useChatAutoScroll(
	messages: ClientChatMessage[],
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

			// react-aria's Virtualizer resets scroll to the top whenever the collection
			// changes; undo so it neither unpins auto scroll nor yanks the user out of history
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

	// the virtualizer resizes the content asynchronously as it measures rows, without
	// scroll events, so keep the view glued to the bottom while pinned there
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
	const latestMessagePublicId = latestMessage?.publicId;
	const latestMessageIsOwn =
		user != null && latestMessage?.authorUserId === user.id;

	React.useEffect(() => {
		if (!latestMessagePublicId) return;

		if (latestMessageIsOwn || pinnedToBottomRef.current) {
			scrollToBottom();
		} else {
			setUnseenMessages(true);
		}
	}, [latestMessagePublicId, latestMessageIsOwn, scrollToBottom]);

	return {
		unseenMessagesInTheRoom: unseenMessages,
		scrollToBottom,
	};
}

/**
 * Subscribes the page to a server event topic (a pure fan-out channel: no metadata, participants
 * or history) so `revalidate` broadcasts to it revalidate loaders. `connected=false` opts out,
 * e.g. once a tournament is finalized.
 */
export function useTopicRevalidation(topic: string, connected = true) {
	useLiveRevalidation(connected);
	useEventsTopic(topic, connected);
}

export function useLiveRevalidation(enabled = true) {
	const user = useUser();
	const { revalidate } = useRevalidator();

	useEventStreamCatchUp({
		// a logged out visitor has no event stream to miss broadcasts from in the first
		// place, and revalidating for them would only add load
		enabled: enabled && user != null,
		// the catch-up itself is already jittered, so it does not go through the
		// broadcast scheduler on top of that
		onCatchUp: () => revalidateWithScope(revalidate, undefined),
	});
}

/** Handles SSE `revalidate` events: plays the carried sound and schedules a loader revalidation, skipping the actor's own broadcasts (their submission already reran the loaders). */
export function useServerRevalidationEvents(userId: number) {
	const { revalidate } = useRevalidator();

	useServerEventListener((event) => {
		if (event.kind !== "revalidate") return;

		playMessageSound(event.type);

		if (event.authorUserId === userId) return;

		// jittered so a broadcast fanning out to a whole room does not make
		// every subscribed client refetch in the same instant
		scheduleBroadcastRevalidation(revalidate, event.scope);
	});
}
