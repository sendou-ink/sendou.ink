import clsx from "clsx";
import { sub } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import {
	ListBox,
	ListBoxItem,
	ListLayout,
	Virtualizer,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { useEventsReadyState } from "~/features/events/events-hooks";
import {
	type FormRenderProps,
	SendouForm,
	useFormValue,
} from "~/form/SendouForm";
import { databaseTimestampToDate } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { SubmitButton } from "../../../components/SubmitButton";
import { useDateTimeFormat } from "../../../hooks/intl/useDateTimeFormat";
import { useChatAutoScroll } from "../chat-hooks";
import { findRoomLinks } from "../chat-message-links";
import { sendChatMessageSchema } from "../chat-schemas";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import styles from "./Chat.module.css";

const MESSAGE_GAP = 8;
const ESTIMATED_MESSAGE_HEIGHT = 44;
const VIRTUALIZER_LAYOUT_OPTIONS = {
	gap: MESSAGE_GAP,
	estimatedRowSize: ESTIMATED_MESSAGE_HEIGHT,
};

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
			default: {
				return null;
			}
		}
	};

	return (
		<section className={clsx(styles.container, className)}>
			<div className={styles.inputContainer}>
				<Virtualizer
					layout={ListLayout}
					layoutOptions={VIRTUALIZER_LAYOUT_OPTIONS}
				>
					<ListBox
						ref={messagesContainerRef}
						aria-label="Chat messages"
						selectionMode="none"
						items={messages}
						className={clsx(
							styles.messages,
							"scrollbar",
							messagesContainerClassName,
						)}
					>
						{(msg) => {
							// react-aria keys the row by the rendered element's own `id`, and
							// every pending send shares `message.id`
							const systemMessage = systemMessageText(msg);
							if (systemMessage) {
								return (
									<SystemMessage
										id={msg.publicId}
										message={msg}
										text={systemMessage}
									/>
								);
							}

							return (
								<Message
									id={msg.publicId}
									message={msg}
									label={
										msg.authorUserId != null
											? labelByUserId?.[msg.authorUserId]
											: undefined
									}
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

function Composer({ onSend }: { onSend: ChatProps["onSend"] }) {
	const { t } = useTranslation(["common"]);
	const { pathname } = useLocation();
	const readyState = useEventsReadyState();
	const [publicId, setPublicId] = React.useState(() => shortNanoid());
	const [hasSent, setHasSent] = React.useState(false);

	// a send's autofocus must not carry over to an unrelated page
	React.useEffect(() => {
		setHasSent(false);
	}, [pathname]);

	const sendingDisabled = readyState !== "CONNECTED";

	return (
		<SendouForm
			key={publicId}
			schema={sendChatMessageSchema}
			defaultValues={{ publicId }}
			className={styles.composer}
			hideSubmitButton
			guardUnsavedChanges={false}
			// `onApply` bypasses the router: chat-client POSTs the message itself,
			// so sending never revalidates the page's loaders
			onApply={(values) => {
				onSend(values);
				setPublicId(shortNanoid());
				setHasSent(true);
			}}
		>
			{({ FormField }) => (
				<>
					{readyState !== "CONNECTED" ? (
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
					<ComposerRow
						FormField={FormField}
						sendingDisabled={sendingDisabled}
						hasSent={hasSent}
					/>
				</>
			)}
		</SendouForm>
	);
}

function ComposerRow({
	FormField,
	sendingDisabled,
	hasSent,
}: {
	FormField: FormRenderProps<typeof sendChatMessageSchema.entries>["FormField"];
	sendingDisabled: boolean;
	hasSent: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const contents = useFormValue("contents");
	const isEmpty = typeof contents !== "string" || contents.trim().length === 0;

	return (
		<div className={styles.composerRow}>
			<FormField
				name="contents"
				disabled={sendingDisabled}
				autoFocus={hasSent}
			/>
			<SubmitButton
				className={styles.sendButton}
				size="small"
				isDisabled={sendingDisabled || isEmpty}
				aria-label={t("common:chat.send")}
				icon={<SendHorizontal size={16} />}
				testId="chat-submit-button"
			/>
		</div>
	);
}

function Message({
	id,
	message,
	label,
}: {
	id: string;
	message: ClientChatMessage;
	label?: string;
}) {
	const author = message.author;

	return (
		<ListBoxItem
			id={id}
			className={styles.message}
			textValue={message.contents ?? author?.username ?? "???"}
		>
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
		</ListBoxItem>
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
	id,
	message,
	text,
}: {
	id: string;
	message: ClientChatMessage;
	text: string;
}) {
	return (
		<ListBoxItem id={id} className={styles.message} textValue={text}>
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
