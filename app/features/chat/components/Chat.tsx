import clsx from "clsx";
import { sub } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import { browser } from "react-dom";
import { useTranslation } from "react-i18next";
import * as v from "valibot";
import { useEventsReadyState } from "~/features/events/events-hooks";
import { useDebounce } from "~/hooks/useDebounce";
import { useVirtualizer } from "~/modules/virtualizer/react";
import { databaseTimestampToDate } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { useDateTimeFormat } from "../../../hooks/intl/useDateTimeFormat";
import { MESSAGE_MAX_LENGTH } from "../chat-constants";
import { useChatAutoScroll } from "../chat-hooks";
import { findRoomLinks } from "../chat-message-links";
import { sendChatMessageSchema } from "../chat-schemas";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import styles from "./Chat.module.css";

const MESSAGE_GAP = 8;
const ESTIMATED_MESSAGE_HEIGHT = 44;
/** How long the stream may be down before the composer says so, so a connect right after page load never flashes it. */
const CONNECTION_STATUS_GRACE_MS = 1_500;

export interface ChatProps {
	messages: ClientChatMessage[];
	/** Hands a validated composer send to the chat client (optimistic append + POST). */
	onSend: (message: { publicId: string; contents: string }) => void;
	/** Role labels (e.g. "TO") shown next to the author, keyed by user id. */
	labelByUserId?: Record<number, string>;
	className?: string;
	messagesContainerClassName?: string;
	/** Renders the room read-only with an expiry note, e.g. once it has expired. */
	disabled?: boolean;
	/** Renders the room read-only for a viewer who may never post in it (staff reading a private room). */
	readOnly?: boolean;
}

export function Chat({
	messages,
	onSend,
	labelByUserId,
	className,
	messagesContainerClassName,
	disabled,
	readOnly,
}: ChatProps) {
	const { t } = useTranslation(["common"]);

	return (
		<section className={clsx(styles.container, className)}>
			<div className={styles.inputContainer}>
				<React.Suspense
					fallback={
						// the same role as the log so the sidebar sizes it the same
						<div
							role="log"
							aria-label="Chat messages"
							className={clsx(
								styles.messages,
								"scrollbar",
								messagesContainerClassName,
							)}
						/>
					}
				>
					<MessageLog
						messages={messages}
						labelByUserId={labelByUserId}
						className={messagesContainerClassName}
					/>
				</React.Suspense>
				{readOnly ? (
					// only observers ever see this, so it stays English
					<div className="text-xs text-lighter text-center my-4">Read-only</div>
				) : disabled ? (
					<div className="text-xs text-lighter text-center my-4">
						{t("common:chat.expired")}
					</div>
				) : (
					<Composer onSend={onSend} />
				)}
			</div>
		</section>
	);
}

function MessageLog({
	messages,
	labelByUserId,
	className,
}: Pick<ChatProps, "messages" | "labelByUserId"> & { className?: string }) {
	// the server can't open the pane scrolled to its end, so it stays empty
	// (the fallback holding its place) until the browser renders it
	React.use(browser("the chat log opens scrolled to its end"));

	const { t } = useTranslation(["common"]);
	const messagesContainerRef = React.useRef<HTMLDivElement>(null);

	const { unseenMessagesInTheRoom, scrollToBottom } = useChatAutoScroll(
		messages,
		messagesContainerRef,
	);

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
			default: {
				return null;
			}
		}
	};

	const virtualizer = useVirtualizer({
		count: messages.length,
		scrollRef: messagesContainerRef,
		estimatedSize: ESTIMATED_MESSAGE_HEIGHT,
		gap: MESSAGE_GAP,
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

						return (
							<div
								key={msg.publicId}
								ref={virtualizer.measureElement(index)}
								className={styles.messageRow}
								data-testid="chat-message-row"
								style={{ transform: `translateY(${start}px)` }}
							>
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

/** A plain form on purpose: the chat client POSTs the message itself, so sending never touches the router or revalidates the page's loaders. */
function Composer({ onSend }: { onSend: ChatProps["onSend"] }) {
	const { t } = useTranslation(["common", "forms"]);
	const readyState = useEventsReadyState();
	const [contents, setContents] = React.useState("");
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [connectionStatusShown, setConnectionStatusShown] =
		React.useState(false);
	useDebounce(
		() => setConnectionStatusShown(readyState !== "CONNECTED"),
		CONNECTION_STATUS_GRACE_MS,
		[readyState],
	);

	const sendingDisabled = readyState !== "CONNECTED";
	const showConnectionStatus = sendingDisabled && connectionStatusShown;
	const isEmpty = contents.trim().length === 0;

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (sendingDisabled || isEmpty) return;

		const parsed = v.safeParse(sendChatMessageSchema, {
			publicId: shortNanoid(),
			contents,
		});
		if (!parsed.success) return;

		onSend(parsed.output);
		setContents("");
		inputRef.current?.focus();
	};

	return (
		<form className={styles.composer} onSubmit={handleSubmit}>
			{showConnectionStatus ? (
				<div
					className={clsx(
						"text-xxs font-semi-bold",
						readyState === "CONNECTING" ? "text-lighter" : "text-warning",
					)}
				>
					{t(
						readyState === "CONNECTING"
							? "common:chat.connecting"
							: "common:chat.disconnected",
					)}
				</div>
			) : null}
			<div className={styles.composerRow}>
				<input
					ref={inputRef}
					value={contents}
					onChange={(event) => setContents(event.target.value)}
					placeholder={t("forms:placeholders.chatMessage")}
					maxLength={MESSAGE_MAX_LENGTH}
					disabled={sendingDisabled}
				/>
				<SendouButton
					type="submit"
					className={styles.sendButton}
					size="small"
					isDisabled={sendingDisabled || isEmpty}
					aria-label={t("common:chat.send")}
					icon={<SendHorizontal size={16} />}
					data-testid="chat-submit-button"
				/>
			</div>
		</form>
	);
}

function Message({
	message,
	label,
}: {
	message: ClientChatMessage;
	label?: string;
}) {
	const author = message.author;

	return (
		<div className={styles.message}>
			{author ? (
				<div
					className={clsx(styles.avatarWrapper, {
						[styles.avatarWrapperStaff]: label,
					})}
				>
					<Avatar user={author} size="xs" />
					{label ? <span className={styles.avatarBadge}>{label}</span> : null}
				</div>
			) : null}
			<div>
				<div className={styles.messageInfo}>
					<div
						className={styles.messageUser}
						style={
							author?.chatNameHue
								? { "--chat-hue": author.chatNameHue }
								: undefined
						}
					>
						{author?.username ?? "???"}
					</div>
					<PronounsTag author={author} />
					{!message.pending ? (
						<MessageTimestamp createdAt={message.createdAt} />
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
		</div>
	);
}

function PronounsTag({ author }: { author: ChatMessageAuthor | null }) {
	if (!author?.pronouns) return null;

	return (
		<span className={styles.pronounsTag}>
			{author.pronouns.subject}/{author.pronouns.object}
		</span>
	);
}

function SystemMessage({
	message,
	text,
}: {
	message: ClientChatMessage;
	text: string;
}) {
	return (
		<div className={styles.message}>
			<div>
				<div className="stack horizontal sm">
					<MessageTimestamp createdAt={message.createdAt} />
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
		</div>
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

function MessageTimestamp({ createdAt }: { createdAt: number }) {
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
	const date = databaseTimestampToDate(createdAt);
	const moreThanDayAgo = sub(new Date(), { days: 1 }) > date;

	return (
		<time className={styles.messageTime}>
			{moreThanDayAgo
				? dateTimeFormatter.format(date)
				: timeFormatter.format(date)}
		</time>
	);
}
