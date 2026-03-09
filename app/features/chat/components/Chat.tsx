import clsx from "clsx";
import { sub } from "date-fns";
import * as React from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { SubmitButton } from "../../../components/SubmitButton";
import { useTimeFormat } from "../../../hooks/useTimeFormat";
import { MESSAGE_MAX_LENGTH } from "../chat-constants";
import { useChat, useChatAutoScroll } from "../chat-hooks";
import type { ChatMessage, ChatProps, ChatUser } from "../chat-types";

export function ConnectedChat(props: ChatProps) {
	const chat = useChat(props);

	return <Chat {...props} chat={chat} />;
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
}: Omit<ChatProps, "revalidates" | "onNewMessage"> & {
	chat: ReturnType<typeof useChat>;
}) {
	const { t } = useTranslation(["common"]);
	const messagesContainerRef = React.useRef<HTMLOListElement>(null);
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
			case "USER_LEFT": {
				return t("common:chat.systemMsg.userLeft", { name: name() });
			}
			default: {
				return null;
			}
		}
	};

	return (
		<section className={clsx("chat__container", className, { hidden })}>
			{rooms.length > 1 ? (
				<div className="stack horizontal">
					{rooms.map((room) => {
						const unseen = unseenMessages.get(room.code);

						return (
							<Button
								key={room.code}
								className={clsx("chat__room-button", {
									current: currentRoom === room.code,
								})}
								onPress={() => {
									setCurrentRoom(room.code);
									resetScroller();
								}}
							>
								<span className="chat__room-button__unseen invisible" />
								{room.label}
								{unseen ? (
									<span className="chat__room-button__unseen">{unseen}</span>
								) : (
									<span className="chat__room-button__unseen invisible" />
								)}
							</Button>
						);
					})}
				</div>
			) : null}
			<div className="chat__input-container">
				<ol
					className={clsx("chat__messages", messagesContainerClassName)}
					ref={messagesContainerRef}
				>
					{messages.map((msg) => {
						const systemMessage = systemMessageText(msg);
						if (systemMessage) {
							return (
								<SystemMessage
									key={msg.id}
									message={msg}
									text={systemMessage}
								/>
							);
						}

						const user = msg.userId ? users[msg.userId] : null;
						if (!user && !missingUserName) return null;

						return (
							<Message
								key={msg.id}
								user={user}
								missingUserName={missingUserName}
								message={msg}
							/>
						);
					})}
				</ol>
				{unseenMessagesInTheRoom ? (
					<SendouButton
						className="chat__unseen-messages"
						onPress={scrollToBottom}
					>
						{t("common:chat.newMessages")}
					</SendouButton>
				) : null}
				<form onSubmit={handleSubmit} className="mt-4">
					<input
						className="w-full"
						ref={inputRef}
						placeholder={t("common:chat.input.placeholder")}
						disabled={sendingMessagesDisabled}
						maxLength={MESSAGE_MAX_LENGTH}
					/>{" "}
					<div className="chat__bottom-row">
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
							size="small"
							variant="minimal"
							isDisabled={sendingMessagesDisabled}
						>
							{t("common:chat.send")}
						</SubmitButton>
					</div>
				</form>
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
		<li className="chat__message">
			{user ? (
				<div
					className={clsx("chat__avatar-wrapper", {
						"chat__avatar-wrapper--staff": user.title,
					})}
				>
					<Avatar user={user} size="xs" />
					{user.title ? (
						<span className="chat__avatar-badge">{user.title}</span>
					) : null}
				</div>
			) : null}
			<div>
				<div className="chat__message__info">
					<div
						className="chat__message__user"
						style={
							user?.chatNameColor
								? { "--chat-user-color": user.chatNameColor }
								: undefined
						}
					>
						{user?.username ?? missingUserName}
					</div>
					{user?.pronouns ? (
						<span className="chat__pronouns-tag">
							{user.pronouns.subject}/{user.pronouns.object}
						</span>
					) : null}
					{!message.pending ? (
						<MessageTimestamp timestamp={message.timestamp} />
					) : null}
				</div>
				<div
					className={clsx("chat__message__contents", {
						pending: message.pending,
					})}
				>
					{message.contents}
				</div>
			</div>
		</li>
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
		<li className="chat__message">
			<div>
				<div className="stack horizontal sm">
					<MessageTimestamp timestamp={message.timestamp} />
				</div>
				<div className="chat__message__contents text-xs text-lighter font-semi-bold">
					{text}
				</div>
			</div>
		</li>
	);
}

function MessageTimestamp({ timestamp }: { timestamp: number }) {
	const { formatDateTime, formatTime } = useTimeFormat();
	const moreThanDayAgo = sub(new Date(), { days: 1 }) > new Date(timestamp);

	return (
		<time className="chat__message__time">
			{moreThanDayAgo
				? formatDateTime(new Date(timestamp), {
						day: "numeric",
						month: "numeric",
						hour: "numeric",
						minute: "numeric",
					})
				: formatTime(new Date(timestamp))}
		</time>
	);
}
