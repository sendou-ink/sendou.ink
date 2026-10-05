import clsx from "clsx";
import { sub } from "date-fns";
import { Reply, RotateCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { databaseTimestampToDate } from "~/utils/dates";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { useDateTimeFormat } from "../../../hooks/intl/useDateTimeFormat";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import * as Mentions from "../core/Mentions";
import * as MessageLinks from "../core/MessageLinks";
import * as Replies from "../core/Replies";
import * as Stickers from "../core/Stickers";
import styles from "./Message.module.css";
import { MessagesContext } from "./MessagesContext";
import { StickerImage } from "./StickerImage";

const STICKER_MESSAGE_SIZE = 96;

export function Message({
	message,
	label,
	onRetry,
	continuation,
	flashing,
	onFlashEnd,
}: {
	message: ClientChatMessage;
	label?: string;
	onRetry?: (publicId: string) => void;
	continuation: boolean;
	flashing: boolean;
	onFlashEnd: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const author = message.author;
	const { ownUserId, messagesById, onReply, replyingToMessageId } =
		React.use(MessagesContext);
	const { rest, replyToMessageId } = Replies.split(message.contents ?? "");
	const { text, sticker } = Stickers.split(rest);
	const repliedMessage =
		replyToMessageId !== null ? messagesById.get(replyToMessageId) : undefined;
	const isOwn = ownUserId !== null && message.authorUserId === ownUserId;
	const highlighted =
		ownUserId !== null &&
		!isOwn &&
		((message.contents !== null &&
			Mentions.mentionsUser(message.contents, ownUserId)) ||
			repliedMessage?.authorUserId === ownUserId);
	const canReply = onReply !== null && !message.pending;

	return (
		<div
			className={clsx(styles.message, styles.messageHoverable, {
				[styles.messageMentionsYou]: highlighted,
				[styles.messageFailed]: message.failed,
				[styles.messageReplyTarget]:
					!message.pending && message.id === replyingToMessageId,
				[styles.messageFlash]: flashing,
			})}
			tabIndex={-1}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget) onFlashEnd();
			}}
		>
			{replyToMessageId !== null ? (
				<ReplyReference message={repliedMessage} />
			) : null}
			{continuation ? (
				<div className={styles.continuationGutter} />
			) : author ? (
				<div
					className={clsx(styles.avatarWrapper, {
						[styles.avatarWrapperStaff]: label,
					})}
				>
					<Avatar user={author} size="xs" />
					{label ? <span className={styles.avatarBadge}>{label}</span> : null}
				</div>
			) : null}
			<div className={styles.messageBody}>
				{continuation ? null : (
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
				)}
				<div
					className={clsx(styles.messageContents, {
						[styles.messageContentsPending]: message.pending,
					})}
				>
					{text ? <MessageContents text={text} /> : null}
					{sticker ? (
						<StickerImage
							sticker={sticker}
							size={STICKER_MESSAGE_SIZE}
							alt={sticker.name}
							className={styles.sticker}
							data-testid="chat-message-sticker"
						/>
					) : null}
				</div>
				{message.failed && onRetry ? (
					<SendouButton
						variant="minimal-destructive"
						size="miniscule"
						icon={<RotateCw />}
						onClick={() => onRetry(message.publicId)}
						className={styles.retryButton}
					>
						{t("common:chat.retrySend")}
					</SendouButton>
				) : null}
			</div>
			{canReply ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					shape="square"
					icon={<Reply />}
					aria-label={t("common:chat.reply.action")}
					onClick={() => onReply(message)}
					className={styles.replyButton}
				/>
			) : null}
		</div>
	);
}

function ReplyReference({
	message,
}: {
	message: ClientChatMessage | undefined;
}) {
	const { t } = useTranslation(["common"]);
	const { usersById, onJumpToMessage } = React.use(MessagesContext);

	if (!message) {
		return (
			<div className={styles.replyReference}>
				<span className={styles.replyReferenceGutter} />
				<span className={styles.replyReferenceText}>
					{t("common:chat.reply.unavailable")}
				</span>
			</div>
		);
	}

	const { text, sticker } = Stickers.split(
		Replies.split(message.contents ?? "").rest,
	);
	const snippet = Mentions.split(text)
		.map((part) =>
			part.type === "mention"
				? `@${usersById.get(part.userId)?.username ?? t("common:chat.mention.unknownUser")}`
				: part.text,
		)
		.join("");

	return (
		<button
			type="button"
			className={clsx(styles.replyReference, styles.replyReferenceButton)}
			onClick={() => onJumpToMessage(message.id)}
		>
			<span className={styles.replyReferenceGutter} />
			<span className={styles.replyReferenceContent}>
				{message.author ? <Avatar user={message.author} size="xxxs" /> : null}
				<span className={styles.replyReferenceAuthor}>
					@{message.author?.username ?? "???"}
				</span>
				<span className={styles.replyReferenceText}>
					{snippet || sticker?.name}
				</span>
			</span>
		</button>
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

export function SystemMessage({
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
	return Mentions.split(text).map((part, i) =>
		part.type === "mention" ? (
			<Mention key={i} userId={part.userId} />
		) : (
			<TextWithRoomLinks key={i} text={part.text} />
		),
	);
}

function Mention({ userId }: { userId: number }) {
	const { t } = useTranslation(["common"]);
	const { usersById, ownUserId } = React.use(MessagesContext);

	return (
		<span
			className={clsx(styles.mention, {
				[styles.mentionSelf]: userId === ownUserId,
			})}
		>
			@{usersById.get(userId)?.username ?? t("common:chat.mention.unknownUser")}
		</span>
	);
}

function TextWithRoomLinks({ text }: { text: string }) {
	const matches = MessageLinks.findRoomLinks(text);

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
