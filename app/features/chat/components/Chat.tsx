import clsx from "clsx";
import { sub } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import {
	Button,
	ListBox,
	ListBoxItem,
	ListLayout,
	Virtualizer,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { SubmitButton } from "../../../components/SubmitButton";
import { useDateTimeFormat } from "../../../hooks/intl/useDateTimeFormat";
import { findRoomLinks, MESSAGE_MAX_LENGTH } from "../chat-constants";
import { useChatAutoScroll } from "../chat-hooks";
import type { ChatMessage, ChatProps, ChatUser } from "../chat-types";
import styles from "./Chat.module.css";

const MESSAGE_GAP = 8;
const ESTIMATED_MESSAGE_HEIGHT = 44;

export interface ChatAdapter {
	messages: ChatMessage[];
	send: (contents: string) => void;
	currentRoom: string | undefined;
	setCurrentRoom: (room: string) => void;
	readyState: "CONNECTING" | "CONNECTED" | "CLOSED";
	unseenMessages: Map<string, number>;
}

export function Chat({
	users,
	rooms,
	className,
	messagesContainerClassName,
	hidden = false,
	chat,
	onMount,
	onUnmount,
	disabled,
	missingUserName,
}: Omit<ChatProps, "onNewMessage" | "revalidates"> & {
	chat: ChatAdapter;
}) {
	const { t } = useTranslation(["common"]);
	const messagesContainerRef = React.useRef<HTMLDivElement>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const {
		send,
		messages,
		currentRoom,
		setCurrentRoom,
		readyState,
		unseenMessages,
	} = chat;

	const handleSubmit = React.useCallback(
		(e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault();

			// can't send empty messages
			if (inputRef.current!.value.trim().length === 0) {
				return;
			}

			send(inputRef.current!.value);
			inputRef.current!.value = "";
		},
		[send],
	);

	const { unseenMessagesInTheRoom, scrollToBottom, resetScroller } =
		useChatAutoScroll(messages, messagesContainerRef);

	React.useEffect(() => {
		onMount?.();

		return () => {
			onUnmount?.();
		};
	}, [onMount, onUnmount]);

	const sendingMessagesDisabled = disabled || readyState !== "CONNECTED";

	const systemMessageText = (msg: ChatMessage) => {
		const name = () => {
			if (!msg.context) return "";
			return msg.context.name;
		};

		switch (msg.type) {
			case "SCORE_REPORTED": {
				return t("common:chat.systemMsg.scoreReported", { name: name() });
			}
			case "SCORE_CONFIRMED": {
				return t("common:chat.systemMsg.scoreConfirmed", { name: name() });
			}
			case "CANCEL_REPORTED": {
				return t("common:chat.systemMsg.cancelReported", { name: name() });
			}
			case "CANCEL_CONFIRMED": {
				return t("common:chat.systemMsg.cancelConfirmed", { name: name() });
			}
			case "CANCEL_REFUSED": {
				return t("common:chat.systemMsg.cancelRefused", { name: name() });
			}
			case "USER_LEFT": {
				return t("common:chat.systemMsg.userLeft", { name: name() });
			}
			case "MAP_REPLAYED": {
				return t("common:chat.systemMsg.mapReplayed", { name: name() });
			}
			case "MAP_PICKED": {
				return t("common:chat.systemMsg.mapPicked", { name: name() });
			}
			default: {
				return null;
			}
		}
	};

	const renderableMessages = messages.filter((msg) => {
		if (systemMessageText(msg)) return true;

		const user = msg.userId ? users[msg.userId] : null;
		return Boolean(user) || Boolean(missingUserName);
	});

	return (
		<section className={clsx(styles.container, className, { hidden })}>
			{rooms.length > 1 ? (
				<div className="stack horizontal">
					{rooms.map((room) => {
						const unseen = unseenMessages.get(room.code);

						return (
							<Button
								key={room.code}
								className={clsx(styles.roomButton, {
									[styles.roomButtonCurrent]: currentRoom === room.code,
								})}
								onPress={() => {
									setCurrentRoom(room.code);
									resetScroller();
								}}
							>
								<span className={clsx(styles.roomButtonUnseen, "invisible")} />
								{room.label}
								{unseen ? (
									<span className={styles.roomButtonUnseen}>{unseen}</span>
								) : (
									<span
										className={clsx(styles.roomButtonUnseen, "invisible")}
									/>
								)}
							</Button>
						);
					})}
				</div>
			) : null}
			<div className={styles.inputContainer}>
				<Virtualizer
					layout={ListLayout}
					layoutOptions={{
						gap: MESSAGE_GAP,
						estimatedRowSize: ESTIMATED_MESSAGE_HEIGHT,
					}}
				>
					<ListBox
						ref={messagesContainerRef}
						aria-label="Chat messages"
						selectionMode="none"
						items={renderableMessages}
						className={clsx(
							styles.messages,
							"scrollbar",
							messagesContainerClassName,
						)}
					>
						{(msg) => {
							const systemMessage = systemMessageText(msg);
							if (systemMessage) {
								return <SystemMessage message={msg} text={systemMessage} />;
							}

							const user = msg.userId ? users[msg.userId] : null;

							return (
								<Message
									user={user}
									missingUserName={missingUserName}
									message={msg}
								/>
							);
						}}
					</ListBox>
				</Virtualizer>
				{unseenMessagesInTheRoom ? (
					<SendouButton
						className={styles.unseenMessages}
						onPress={scrollToBottom}
					>
						{t("common:chat.newMessages")}
					</SendouButton>
				) : null}
				{disabled ? (
					<div className="text-xs text-lighter text-center my-4">
						{t("common:chat.expired")}
					</div>
				) : (
					<form onSubmit={handleSubmit} className="mt-4">
						<input
							className="w-full text-xs"
							ref={inputRef}
							placeholder={t("common:chat.input.placeholder")}
							disabled={sendingMessagesDisabled}
							maxLength={MESSAGE_MAX_LENGTH}
						/>{" "}
						<div className={styles.bottomRow}>
							{readyState === "CONNECTED" || readyState === "CONNECTING" ? (
								<div className="text-xxs font-semi-bold text-lighter">
									{t(
										readyState === "CONNECTED"
											? "common:chat.connected"
											: "common:chat.connecting",
									)}
								</div>
							) : (
								<div className="text-xxs font-semi-bold text-warning">
									{t("common:chat.disconnected")}
								</div>
							)}
							<SubmitButton
								className={styles.sendButton}
								size="small"
								isDisabled={sendingMessagesDisabled}
								aria-label={t("common:chat.send")}
								icon={<SendHorizontal size={16} />}
								testId="chat-submit-button"
							/>
						</div>
					</form>
				)}
			</div>
		</section>
	);
}

function Message({
	user,
	message,
	missingUserName,
}: {
	user?: ChatUser | null;
	message: ChatMessage;
	missingUserName?: string;
}) {
	return (
		<ListBoxItem
			className={styles.message}
			textValue={message.contents ?? user?.username ?? missingUserName ?? ""}
		>
			{user ? (
				<div
					className={clsx(styles.avatarWrapper, {
						[styles.avatarWrapperStaff]: user.title,
					})}
				>
					<Avatar user={user} size="xs" />
					{user.title ? (
						<span className={styles.avatarBadge}>{user.title}</span>
					) : null}
				</div>
			) : null}
			<div>
				<div className={styles.messageInfo}>
					<div
						className={styles.messageUser}
						style={
							user?.chatNameHue ? { "--chat-hue": user.chatNameHue } : undefined
						}
					>
						{user?.username ?? missingUserName}
					</div>
					{user?.pronouns ? (
						<span className={styles.pronounsTag}>
							{user.pronouns.subject}/{user.pronouns.object}
						</span>
					) : null}
					{!message.pending ? (
						<MessageTimestamp timestamp={message.timestamp} />
					) : null}
				</div>
				<div
					className={clsx(styles.messageContents, {
						[styles.messageContentsPending]: message.pending,
					})}
				>
					{message.contents ? (
						<MessageContents text={message.contents} />
					) : null}
				</div>
			</div>
		</ListBoxItem>
	);
}

function SystemMessage({
	message,
	text,
}: {
	message: ChatMessage;
	text: string;
}) {
	return (
		<ListBoxItem className={styles.message} textValue={text}>
			<div>
				<div className="stack horizontal sm">
					<MessageTimestamp timestamp={message.timestamp} />
				</div>
				<div
					className={clsx(
						styles.messageContents,
						"text-xs text-lighter font-semi-bold",
					)}
				>
					{text}
				</div>
			</div>
		</ListBoxItem>
	);
}

function MessageContents({ text }: { text: string }) {
	const matches = findRoomLinks(text);

	if (matches.length === 0) return <>{text}</>;

	const parts: React.ReactNode[] = [];
	let lastIndex = 0;

	for (const [i, match] of matches.entries()) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		parts.push(
			<span key={i} className={styles.roomLinkBlock}>
				<QRCodeSVG value={match.url} size={120} className={styles.roomQrCode} />
				<a
					href={match.url}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.roomLink}
				>
					{match.url}
				</a>
			</span>,
		);
		lastIndex = match.index + match.url.length;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return <>{parts}</>;
}

function MessageTimestamp({ timestamp }: { timestamp: number }) {
	const { formatter: dateTimeFormatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
		hour: "numeric",
		minute: "numeric",
	});
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});
	const moreThanDayAgo = sub(new Date(), { days: 1 }) > new Date(timestamp);

	return (
		<time className={styles.messageTime}>
			{moreThanDayAgo
				? dateTimeFormatter.format(new Date(timestamp))
				: timeFormatter.format(new Date(timestamp))}
		</time>
	);
}
