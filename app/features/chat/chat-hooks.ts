import React from "react";
import { useUser } from "../auth/core/user";
import type { ChatMessage } from "./chat-types";

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
