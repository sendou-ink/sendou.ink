import clsx from "clsx";
import { sub } from "date-fns";
import { Reply, RotateCw, SendHorizontal, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import { browser, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import * as v from "valibot";
import { useUser } from "~/features/auth/core/user";
import { useEventsReadyState } from "~/features/events/events-hooks";
import { useCooldown } from "~/hooks/useCooldown";
import { useDebounce } from "~/hooks/useDebounce";
import { useVirtualizer } from "~/modules/virtualizer/react";
import { databaseTimestampToDate } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { useDateTimeFormat } from "../../../hooks/intl/useDateTimeFormat";
import { MESSAGE_MAX_LENGTH } from "../chat-constants";
import {
	cooldownUntil,
	MENTION_COOLDOWN_MS,
	mentionCooldownKey,
	STICKER_COOLDOWN_KEY,
	STICKER_COOLDOWN_MS,
	startCooldowns,
} from "../chat-cooldowns";
import { useChatAutoScroll } from "../chat-hooks";
import {
	activeMentionQuery,
	encodeMentions,
	mentionedUserIds,
	mentionSuggestions,
	mentionsUser,
	type PickedMention,
	shiftPickedMentions,
	splitByMentions,
} from "../chat-mentions";
import { continuesBatch } from "../chat-message-batches";
import { findRoomLinks } from "../chat-message-links";
import { messageReply, replyToken } from "../chat-replies";
import { sendChatMessageSchema } from "../chat-schemas";
import {
	activeStickerQuery,
	type ChatSticker,
	messageSticker,
	stickerSuggestions,
	stickerToken,
} from "../chat-stickers";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import styles from "./Chat.module.css";
import {
	type ComposerSuggestion,
	ComposerSuggestions,
	composerSuggestionId,
} from "./ComposerSuggestions";
import { StickerImage } from "./StickerImage";

const ESTIMATED_MESSAGE_HEIGHT = 44;
const CONNECTION_STATUS_GRACE_MS = 1_500;
const CHARACTER_COUNT_SHOWN_FROM = MESSAGE_MAX_LENGTH - 40;
const STICKER_MESSAGE_SIZE = 96;
const STICKER_PREVIEW_SIZE = 32;
const STICKER_SUGGESTION_SIZE = 24;

export interface ChatProps {
	messages: ClientChatMessage[];
	/** Hands a validated composer send to the chat client (optimistic append + POST). */
	onSend: (message: { publicId: string; contents: string }) => void;
	onRetry?: (publicId: string) => void;
	/** Role labels (e.g. "TO") shown next to the author, keyed by user id. */
	labelByUserId?: Record<number, string>;
	firstUnreadMessageId?: number | null;
	mentionableUsers?: CommonUser[];
	className?: string;
	messagesContainerClassName?: string;
	/** Renders the room read-only with an expiry note, e.g. once it has expired. */
	disabled?: boolean;
	/** Renders the room read-only for a viewer who may never post in it (staff reading a private room). */
	readOnly?: boolean;
}

const MessagesContext = React.createContext<{
	usersById: Map<number, CommonUser>;
	ownUserId: number | null;
	messagesById: Map<number, ClientChatMessage>;
	onReply: ((message: ClientChatMessage) => void) | null;
	replyingToMessageId: number | null;
}>({
	usersById: new Map(),
	ownUserId: null,
	messagesById: new Map(),
	onReply: null,
	replyingToMessageId: null,
});

export function Chat({
	messages,
	onSend,
	onRetry,
	labelByUserId,
	firstUnreadMessageId,
	mentionableUsers = [],
	className,
	messagesContainerClassName,
	disabled,
	readOnly,
}: ChatProps) {
	const { t } = useTranslation(["common"]);
	const user = useUser();

	const mentionableById = new Map<number, CommonUser>();
	for (const mentionable of [
		...mentionableUsers,
		...messages.flatMap((message) => (message.author ? [message.author] : [])),
	]) {
		mentionableById.set(mentionable.id, mentionable);
	}
	const mentionCandidates = [...mentionableById.values()].filter(
		(mentionable) => mentionable.id !== user?.id,
	);
	const [replyTo, setReplyTo] = React.useState<ClientChatMessage | null>(null);
	const composerInputRef = React.useRef<HTMLInputElement>(null);
	const canPost = !readOnly && !disabled;

	return (
		<MessagesContext
			value={{
				usersById: mentionableById,
				ownUserId: user?.id ?? null,
				messagesById: new Map(
					messages.flatMap((message) =>
						message.pending ? [] : [[message.id, message]],
					),
				),
				onReply: canPost
					? (message) => {
							setReplyTo(message);
							composerInputRef.current?.focus();
						}
					: null,
				replyingToMessageId: replyTo?.id ?? null,
			}}
		>
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
							firstUnreadMessageId={firstUnreadMessageId}
							onRetry={onRetry}
							className={messagesContainerClassName}
						/>
					</React.Suspense>
					{readOnly ? (
						// only observers ever see this, so it stays English
						<div className="text-xs text-lighter text-center my-4">
							Read-only
						</div>
					) : disabled ? (
						<div className="text-xs text-lighter text-center my-4">
							{t("common:chat.expired")}
						</div>
					) : (
						<Composer
							onSend={onSend}
							mentionCandidates={mentionCandidates}
							replyTo={replyTo}
							onCancelReply={() => setReplyTo(null)}
							inputRef={composerInputRef}
						/>
					)}
				</div>
			</section>
		</MessagesContext>
	);
}

function MessageLog({
	messages,
	labelByUserId,
	firstUnreadMessageId = null,
	onRetry,
	className,
}: Pick<
	ChatProps,
	"messages" | "labelByUserId" | "firstUnreadMessageId" | "onRetry"
> & {
	className?: string;
}) {
	// the server can't open the pane scrolled to its end, so it stays empty
	// (the fallback holding its place) until the browser renders it
	React.use(browser("the chat log opens scrolled to its end"));

	const { t } = useTranslation(["common"]);
	const messagesContainerRef = React.useRef<HTMLDivElement>(null);

	const firstUnreadIndex =
		firstUnreadMessageId === null
			? -1
			: messages.findIndex((msg) => msg.id === firstUnreadMessageId);
	const { unseenMessagesInTheRoom, scrollToBottom } = useChatAutoScroll(
		messages,
		messagesContainerRef,
		{
			firstUnreadMessageId:
				firstUnreadIndex === -1 ? null : firstUnreadMessageId,

			firstUnreadOffset: () =>
				firstUnreadIndex === -1 ? null : virtualizer.startOf(firstUnreadIndex),
		},
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
						const continuation = continuesBatch(messages[index - 1], msg);

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
								{index === firstUnreadIndex ? (
									<hr
										aria-label={t("common:chat.newMessages")}
										className={styles.unreadDivider}
										data-testid="chat-unread-divider"
									/>
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
function Composer({
	onSend,
	mentionCandidates,
	replyTo,
	onCancelReply,
	inputRef,
}: {
	onSend: ChatProps["onSend"];
	mentionCandidates: CommonUser[];
	replyTo: ClientChatMessage | null;
	onCancelReply: () => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const { t } = useTranslation(["common", "forms"]);
	const readyState = useEventsReadyState();
	const [contents, setContents] = React.useState("");
	const [caret, setCaret] = React.useState(0);
	const [isFocused, setIsFocused] = React.useState(false);
	const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(0);
	const [dismissedQueryStart, setDismissedQueryStart] = React.useState<
		number | null
	>(null);
	const [pickedMentions, setPickedMentions] = React.useState<PickedMention[]>(
		[],
	);
	const [sticker, setSticker] = React.useState<ChatSticker | null>(null);
	const composerRowRef = React.useRef<HTMLDivElement>(null);
	const suggestionsId = React.useId();
	const [connectionStatusShown, setConnectionStatusShown] =
		React.useState(false);
	useDebounce(
		() => setConnectionStatusShown(readyState !== "CONNECTED"),
		CONNECTION_STATUS_GRACE_MS,
		[readyState],
	);

	const sendingDisabled = readyState !== "CONNECTED";
	const showConnectionStatus = sendingDisabled && connectionStatusShown;
	const isEmpty = contents.trim().length === 0 && !sticker;

	const activeQuery = isFocused ? composerQuery(contents, caret) : null;
	const suggestions =
		activeQuery && activeQuery.start !== dismissedQueryStart
			? suggestionsFor(activeQuery, mentionCandidates)
			: [];
	const suggestionsOpen = suggestions.length > 0;
	const activeSuggestion =
		suggestions[Math.min(activeSuggestionIndex, suggestions.length - 1)];

	const encodedText = encodeMentions(
		contents,
		mentionCandidates,
		pickedMentions,
	);
	const mentionOnCooldown = R.firstBy(
		mentionedUserIds(encodedText).flatMap((userId) => {
			const until = cooldownUntil(mentionCooldownKey(userId));
			return until === null ? [] : [{ userId, until }];
		}),
		[(cooldown) => cooldown.until, "desc"],
	);
	const mentionCooldownSecondsLeft = useCooldown(
		mentionOnCooldown?.until ?? null,
	);
	const stickerCooldownSecondsLeft = useCooldown(
		sticker ? cooldownUntil(STICKER_COOLDOWN_KEY) : null,
	);
	const mentionOnCooldownShown =
		mentionOnCooldown !== undefined && mentionCooldownSecondsLeft > 0;
	const stickerOnCooldownShown =
		sticker !== null && stickerCooldownSecondsLeft > 0;
	const onCooldown = mentionOnCooldownShown || stickerOnCooldownShown;

	const status = showConnectionStatus
		? t(
				readyState === "CONNECTING"
					? "common:chat.connecting"
					: "common:chat.disconnected",
			)
		: mentionOnCooldownShown
			? t("common:chat.status.mentionCooldown", {
					username: mentionCandidates.find(
						(user) => user.id === mentionOnCooldown.userId,
					)?.username,
					seconds: mentionCooldownSecondsLeft,
				})
			: stickerOnCooldownShown
				? t("common:chat.status.stickerCooldown", {
						seconds: stickerCooldownSecondsLeft,
					})
				: contents.length >= CHARACTER_COUNT_SHOWN_FROM
					? t("common:chat.status.characterCount", {
							used: contents.length,
							max: MESSAGE_MAX_LENGTH,
						})
					: null;

	const syncCaret = (input: HTMLInputElement) =>
		setCaret(input.selectionStart ?? input.value.length);

	const replaceQuery = (
		query: { start: number },
		replacement: string,
		onReplaced?: (next: string) => void,
	) => {
		const input = inputRef.current;
		if (!input) return;

		const before = `${contents.slice(0, query.start)}${replacement}`;
		const next = before + contents.slice(caret);
		if (next.length > MESSAGE_MAX_LENGTH) return;

		onReplaced?.(next);
		flushSync(() => setContents(next));
		input.setSelectionRange(before.length, before.length);
		setCaret(before.length);
	};

	const selectSuggestion = (suggestion: Suggestion) => {
		if (!activeQuery) return;

		if (suggestion.kind === "sticker") {
			setSticker(suggestion.sticker);
			replaceQuery(activeQuery, "", (next) =>
				setPickedMentions(shiftPickedMentions(pickedMentions, contents, next)),
			);
			return;
		}

		const { user } = suggestion;
		replaceQuery(activeQuery, `@${user.username} `, (next) =>
			setPickedMentions([
				...shiftPickedMentions(pickedMentions, contents, next),
				{ userId: user.id, username: user.username, start: activeQuery.start },
			]),
		);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!suggestionsOpen) {
			const removesAttachment =
				event.key === "Escape" ||
				(event.key === "Backspace" && contents.length === 0);
			if (removesAttachment && (sticker || replyTo)) {
				event.preventDefault();
				if (sticker) {
					setSticker(null);
				} else {
					onCancelReply();
				}
			}
			return;
		}

		switch (event.key) {
			case "ArrowDown":
			case "ArrowUp": {
				event.preventDefault();
				const step = event.key === "ArrowDown" ? 1 : -1;
				const nextIndex =
					(suggestions.indexOf(activeSuggestion) + step + suggestions.length) %
					suggestions.length;
				setActiveSuggestionIndex(nextIndex);
				document
					.getElementById(
						composerSuggestionId(suggestionsId, suggestions[nextIndex].key),
					)
					?.scrollIntoView({ block: "nearest" });
				break;
			}
			case "Enter":
			case "Tab": {
				event.preventDefault();
				selectSuggestion(activeSuggestion);
				break;
			}
			case "Escape": {
				event.preventDefault();
				setDismissedQueryStart(activeQuery!.start);
				break;
			}
		}
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (sendingDisabled || isEmpty || onCooldown) return;

		const parsed = v.safeParse(sendChatMessageSchema, {
			publicId: shortNanoid(),
			contents: [
				replyTo ? replyToken(replyTo.id) : null,
				encodedText.trim(),
				sticker ? stickerToken(sticker.id) : null,
			]
				.filter(Boolean)
				.join(" "),
		});
		if (!parsed.success) return;

		onSend(parsed.output);
		startCooldowns(
			mentionedUserIds(parsed.output.contents).map(mentionCooldownKey),
			MENTION_COOLDOWN_MS,
		);
		if (sticker) {
			startCooldowns([STICKER_COOLDOWN_KEY], STICKER_COOLDOWN_MS);
		}
		setContents("");
		setPickedMentions([]);
		setSticker(null);
		onCancelReply();
		setDismissedQueryStart(null);
		inputRef.current?.focus();
	};

	return (
		<>
			{replyTo ? (
				<div className={styles.composerAttachment}>
					<Reply size={18} className={styles.composerAttachmentIcon} />
					<span className={styles.composerAttachmentLabel}>
						{t("common:chat.reply.replyingTo", {
							username: replyTo.author?.username ?? "???",
						})}
					</span>
					<SendouButton
						variant="minimal-destructive"
						size="small"
						shape="square"
						icon={<X />}
						aria-label={t("common:chat.reply.cancel")}
						onClick={() => {
							onCancelReply();
							inputRef.current?.focus();
						}}
						className={styles.composerAttachmentRemove}
					/>
				</div>
			) : null}
			{sticker ? (
				<div className={styles.composerAttachment}>
					<StickerImage sticker={sticker} size={STICKER_PREVIEW_SIZE} />
					<span className={styles.composerAttachmentLabel}>{sticker.name}</span>
					<SendouButton
						variant="minimal-destructive"
						size="small"
						shape="square"
						icon={<X />}
						aria-label={t("common:chat.sticker.remove")}
						onClick={() => {
							setSticker(null);
							inputRef.current?.focus();
						}}
						className={styles.composerAttachmentRemove}
					/>
				</div>
			) : null}
			<div
				role="status"
				className={clsx(styles.composerStatus, {
					[styles.composerStatusWarning]:
						showConnectionStatus && readyState !== "CONNECTING",
				})}
			>
				{status}
			</div>
			<form className={styles.composer} onSubmit={handleSubmit}>
				<div ref={composerRowRef} className={styles.composerRow}>
					<input
						ref={inputRef}
						value={contents}
						onChange={(event) => {
							const input = event.target;
							setPickedMentions(
								shiftPickedMentions(pickedMentions, contents, input.value),
							);
							setContents(input.value);
							syncCaret(input);
							setActiveSuggestionIndex(0);
							if (
								composerQuery(input.value, input.selectionStart ?? 0)?.start !==
								dismissedQueryStart
							) {
								setDismissedQueryStart(null);
							}
						}}
						onSelect={(event) => syncCaret(event.currentTarget)}
						onKeyDown={handleKeyDown}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						placeholder={t("forms:placeholders.chatMessage")}
						maxLength={MESSAGE_MAX_LENGTH}
						disabled={sendingDisabled}
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={suggestionsOpen}
						aria-controls={suggestionsId}
						aria-activedescendant={
							suggestionsOpen
								? composerSuggestionId(suggestionsId, activeSuggestion.key)
								: undefined
						}
					/>
					<ComposerSuggestions
						id={suggestionsId}
						anchorRef={composerRowRef}
						suggestions={suggestions}
						activeKey={suggestionsOpen ? activeSuggestion.key : null}
						onSelect={selectSuggestion}
						aria-label={t(
							activeQuery?.kind === "sticker"
								? "common:chat.sticker.suggestions"
								: "common:chat.mention.suggestions",
						)}
					/>
					<SendouButton
						type="submit"
						className={styles.sendButton}
						shape="square"
						isDisabled={sendingDisabled || isEmpty || onCooldown}
						aria-label={t("common:chat.send")}
						icon={<SendHorizontal size={18} />}
						data-testid="chat-submit-button"
					/>
				</div>
			</form>
		</>
	);
}

type Suggestion = ComposerSuggestion &
	(
		| { kind: "mention"; user: CommonUser }
		| { kind: "sticker"; sticker: ChatSticker }
	);

function composerQuery(text: string, caret: number) {
	const mentionQuery = activeMentionQuery(text, caret);
	if (mentionQuery) return { kind: "mention" as const, ...mentionQuery };

	const stickerQuery = activeStickerQuery(text, caret);
	if (stickerQuery) return { kind: "sticker" as const, ...stickerQuery };

	return null;
}

function suggestionsFor(
	query: NonNullable<ReturnType<typeof composerQuery>>,
	mentionCandidates: CommonUser[],
): Suggestion[] {
	if (query.kind === "sticker") {
		return stickerSuggestions(query.query).map((sticker) => ({
			kind: "sticker",
			key: `sticker-${sticker.id}`,
			label: sticker.name,
			image: <StickerImage sticker={sticker} size={STICKER_SUGGESTION_SIZE} />,
			sticker,
		}));
	}

	return mentionSuggestions(mentionCandidates, query.query).map((user) => ({
		kind: "mention",
		key: `user-${user.id}`,
		label: user.username,
		image: <Avatar user={user} size="xxxs" />,
		user,
	}));
}

function Message({
	message,
	label,
	onRetry,
	continuation,
}: {
	message: ClientChatMessage;
	label?: string;
	onRetry?: (publicId: string) => void;
	continuation: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const author = message.author;
	const { ownUserId, messagesById, onReply, replyingToMessageId } =
		React.use(MessagesContext);
	const { rest, replyToMessageId } = messageReply(message.contents ?? "");
	const { text, sticker } = messageSticker(rest);
	const repliedMessage =
		replyToMessageId !== null ? messagesById.get(replyToMessageId) : undefined;
	const isOwn = ownUserId !== null && message.authorUserId === ownUserId;
	const highlighted =
		ownUserId !== null &&
		!isOwn &&
		((message.contents !== null && mentionsUser(message.contents, ownUserId)) ||
			repliedMessage?.authorUserId === ownUserId);
	const canReply = onReply !== null && !message.pending;

	return (
		<div
			className={clsx(styles.message, styles.messageHoverable, {
				[styles.messageMentionsYou]: highlighted,
				[styles.messageFailed]: message.failed,
				[styles.messageReplyTarget]:
					!message.pending && message.id === replyingToMessageId,
			})}
			tabIndex={-1}
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
	const { usersById } = React.use(MessagesContext);

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

	const { text, sticker } = messageSticker(
		messageReply(message.contents ?? "").rest,
	);
	const snippet = splitByMentions(text)
		.map((part) =>
			part.type === "mention"
				? `@${usersById.get(part.userId)?.username ?? t("common:chat.mention.unknownUser")}`
				: part.text,
		)
		.join("");

	return (
		<div className={styles.replyReference}>
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
	return splitByMentions(text).map((part, i) =>
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
