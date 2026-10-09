import clsx from "clsx";
import * as React from "react";
import { browser } from "react-dom";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "~/modules/virtualizer/react";
import { SendouButton } from "../../../components/elements/Button";
import { useChatAutoScroll } from "../chat-hooks";
import type { ClientChatMessage } from "../chat-types";
import * as LogLayout from "../core/LogLayout";
import type { ChatProps } from "./Chat";
import { Message, SystemMessage } from "./Message";
import styles from "./MessageLog.module.css";

const ESTIMATED_MESSAGE_HEIGHT = 44;

export function MessageLog({
	messages,
	labelByUserId,
	firstUnreadMessageId = null,
	onRetry,
	jumpToMessageRef,
	className,
}: Pick<
	ChatProps,
	"messages" | "labelByUserId" | "firstUnreadMessageId" | "onRetry"
> & {
	jumpToMessageRef: React.Ref<(messageId: number) => void>;
	className?: string;
}) {
	React.use(browser("the chat log opens scrolled to its end"));

	const { t } = useTranslation(["common"]);
	const messagesContainerRef = React.useRef<HTMLDivElement>(null);

	const firstUnreadIndex =
		firstUnreadMessageId === null
			? -1
			: messages.findIndex((msg) => msg.id === firstUnreadMessageId);
	const [flashingMessageId, setFlashingMessageId] = React.useState<
		number | null
	>(null);
	const { unseenMessagesInTheRoom, scrollToBottom, scrollToOffset } =
		useChatAutoScroll(messages, messagesContainerRef, {
			firstUnreadMessageId:
				firstUnreadIndex === -1 ? null : firstUnreadMessageId,

			firstUnreadOffset: () =>
				firstUnreadIndex === -1 ? null : virtualizer.startOf(firstUnreadIndex),
		});

	const systemMessageText = (msg: ClientChatMessage) => {
		const name = msg.author?.username ?? "";

		switch (msg.type) {
			case "SCORE_REPORTED": {
				return t("common:chat.systemMsg.scoreReported", { name });
			}
			case "SCORE_CONFIRMED": {
				return t("common:chat.systemMsg.scoreConfirmed", { name });
			}
			case "SCORE_DISPUTED": {
				return t("common:chat.systemMsg.scoreDisputed", { name });
			}
			case "CANCEL_REPORTED": {
				return t("common:chat.systemMsg.cancelReported", { name });
			}
			case "CANCEL_CONFIRMED": {
				return t("common:chat.systemMsg.cancelConfirmed", { name });
			}
			case "CANCEL_REFUSED": {
				return t("common:chat.systemMsg.cancelRefused", { name });
			}
			case "USER_LEFT": {
				return t("common:chat.systemMsg.userLeft", { name });
			}
			case "MAP_REPLAYED": {
				return t("common:chat.systemMsg.mapReplayed", { name });
			}
			case "MAP_PICKED": {
				return t("common:chat.systemMsg.mapPicked", { name });
			}
			case "MAP_BANNED": {
				return t("common:chat.systemMsg.mapBanned", { name });
			}
			case "MODE_PICKED": {
				return t("common:chat.systemMsg.modePicked", { name });
			}
			case "MODE_BANNED": {
				return t("common:chat.systemMsg.modeBanned", { name });
			}
			case "LEAGUE_TIMES_PROPOSED": {
				return t("common:chat.systemMsg.leagueTimesProposed", { name });
			}
			case "LEAGUE_TIME_PICKED": {
				return t("common:chat.systemMsg.leagueTimePicked", { name });
			}
			case "LEAGUE_RESCHEDULE_DECLINED": {
				return t("common:chat.systemMsg.leagueRescheduleDeclined", { name });
			}
			case "LEAGUE_TIME_SET_BY_ORGANIZER": {
				return t("common:chat.systemMsg.leagueTimeSetByOrganizer", { name });
			}
			default: {
				return null;
			}
		}
	};

	const virtualizer = useVirtualizer({
		count: messages.length,
		scrollRef: messagesContainerRef,
		estimatedSize: ESTIMATED_MESSAGE_HEIGHT,
	});

	const messagesRef = React.useRef(messages);
	messagesRef.current = messages;
	React.useImperativeHandle(jumpToMessageRef, () => (messageId: number) => {
		const indexOfMessage = () =>
			messagesRef.current.findIndex((msg) => msg.id === messageId);
		if (indexOfMessage() === -1) return;

		scrollToOffset(() => {
			const index = indexOfMessage();
			const container = messagesContainerRef.current;
			if (index === -1 || !container) return null;

			return virtualizer.startOf(index) - container.clientHeight / 3;
		});
		setFlashingMessageId(messageId);
	});

	return (
		<>
			<div
				ref={messagesContainerRef}
				role="log"
				aria-label="Chat messages"
				className={clsx(styles.messages, "scrollbar", className)}
			>
				<div
					className={styles.messagesSizer}
					style={{ height: virtualizer.totalSize }}
				>
					{virtualizer.items.map(({ index, start }) => {
						const msg = messages[index];
						const systemMessage = systemMessageText(msg);
						const isFirstUnread = index === firstUnreadIndex;
						const continuation = LogLayout.continuesBatch(
							messages[index - 1],
							msg,
						);

						return (
							<div
								key={msg.publicId}
								ref={virtualizer.measureElement(index)}
								className={clsx(styles.messageRow, {
									[styles.messageRowFirst]: index === 0,
									[styles.messageRowContinuation]: continuation,
								})}
								data-testid="chat-message-row"
								style={{ transform: `translateY(${start}px)` }}
							>
								{isFirstUnread ? (
									<div
										className={styles.unreadDivider}
										data-testid="chat-unread-divider"
									>
										<span aria-hidden className={styles.unreadDividerLabel}>
											{t("common:chat.newLabel")}
										</span>
										<hr
											aria-label={t("common:chat.newMessages")}
											className={styles.unreadDividerLine}
										/>
									</div>
								) : null}
								{systemMessage ? (
									<SystemMessage message={msg} text={systemMessage} />
								) : (
									<Message
										message={msg}
										label={
											msg.authorUserId != null
												? labelByUserId?.[msg.authorUserId]
												: undefined
										}
										onRetry={onRetry}
										continuation={continuation}
										flashing={!msg.pending && msg.id === flashingMessageId}
										onFlashEnd={() => setFlashingMessageId(null)}
									/>
								)}
							</div>
						);
					})}
				</div>
			</div>
			{unseenMessagesInTheRoom ? (
				<SendouButton
					className={styles.unseenMessages}
					onClick={scrollToBottom}
				>
					{t("common:chat.newMessages")}
				</SendouButton>
			) : null}
		</>
	);
}

export function MessageLogFallback({ className }: { className?: string }) {
	return (
		<div
			role="log"
			aria-label="Chat messages"
			className={clsx(styles.messages, "scrollbar", className)}
		/>
	);
}
