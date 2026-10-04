import clsx from "clsx";
import { Reply, SendHorizontal, X } from "lucide-react";
import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import * as v from "valibot";
import { useEventsReadyState } from "~/features/events/events-hooks";
import { useCooldown } from "~/hooks/useCooldown";
import { useDebounce } from "~/hooks/useDebounce";
import { shortNanoid } from "~/utils/id";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../../../components/Avatar";
import { SendouButton } from "../../../components/elements/Button";
import { MESSAGE_MAX_LENGTH } from "../chat-constants";
import { sendChatMessageSchema } from "../chat-schemas";
import type { ClientChatMessage } from "../chat-types";
import * as Cooldowns from "../core/Cooldowns";
import * as Mentions from "../core/Mentions";
import * as Replies from "../core/Replies";
import * as Stickers from "../core/Stickers";
import type { ChatProps } from "./Chat";
import styles from "./Composer.module.css";
import {
	type ComposerSuggestion,
	ComposerSuggestions,
	composerSuggestionId,
} from "./ComposerSuggestions";
import { StickerImage } from "./StickerImage";

const CONNECTION_STATUS_GRACE_MS = 1_500;
const CHARACTER_COUNT_SHOWN_FROM = MESSAGE_MAX_LENGTH - 40;
const STICKER_PREVIEW_SIZE = 32;
const STICKER_SUGGESTION_SIZE = 24;

export function Composer({
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
	const [pickedMentions, setPickedMentions] = React.useState<
		Mentions.PickedMention[]
	>([]);
	const [sticker, setSticker] = React.useState<Stickers.ChatSticker | null>(
		null,
	);
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

	const encodedText = Mentions.encode(
		contents,
		mentionCandidates,
		pickedMentions,
	);
	const mentionOnCooldown = R.firstBy(
		Mentions.mentionedUserIds(encodedText).flatMap((userId) => {
			const until = Cooldowns.until(Cooldowns.mentionKey(userId));
			return until === null ? [] : [{ userId, until }];
		}),
		[(cooldown) => cooldown.until, "desc"],
	);
	const mentionCooldownSecondsLeft = useCooldown(
		mentionOnCooldown?.until ?? null,
	);
	const stickerCooldownSecondsLeft = useCooldown(
		sticker ? Cooldowns.until(Cooldowns.STICKER_COOLDOWN_KEY) : null,
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
				setPickedMentions(Mentions.shiftPicked(pickedMentions, contents, next)),
			);
			return;
		}

		const { user } = suggestion;
		replaceQuery(activeQuery, `@${user.username} `, (next) =>
			setPickedMentions([
				...Mentions.shiftPicked(pickedMentions, contents, next),
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
				replyTo ? Replies.token(replyTo.id) : null,
				encodedText.trim(),
				sticker ? Stickers.token(sticker.id) : null,
			]
				.filter(Boolean)
				.join(" "),
		});
		if (!parsed.success) return;

		onSend(parsed.output);
		Cooldowns.start(
			Mentions.mentionedUserIds(parsed.output.contents).map(
				Cooldowns.mentionKey,
			),
			Cooldowns.MENTION_COOLDOWN_MS,
		);
		if (sticker) {
			Cooldowns.start(
				[Cooldowns.STICKER_COOLDOWN_KEY],
				Cooldowns.STICKER_COOLDOWN_MS,
			);
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
								Mentions.shiftPicked(pickedMentions, contents, input.value),
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
		| { kind: "sticker"; sticker: Stickers.ChatSticker }
	);

function composerQuery(text: string, caret: number) {
	const mentionQuery = Mentions.activeQuery(text, caret);
	if (mentionQuery) return { kind: "mention" as const, ...mentionQuery };

	const stickerQuery = Stickers.activeQuery(text, caret);
	if (stickerQuery) return { kind: "sticker" as const, ...stickerQuery };

	return null;
}

function suggestionsFor(
	query: NonNullable<ReturnType<typeof composerQuery>>,
	mentionCandidates: CommonUser[],
): Suggestion[] {
	if (query.kind === "sticker") {
		return Stickers.suggestions(query.query).map((sticker) => ({
			kind: "sticker",
			key: `sticker-${sticker.id}`,
			label: sticker.name,
			image: <StickerImage sticker={sticker} size={STICKER_SUGGESTION_SIZE} />,
			sticker,
		}));
	}

	return Mentions.suggestions(mentionCandidates, query.query).map((user) => ({
		kind: "mention",
		key: `user-${user.id}`,
		label: user.username,
		image: <Avatar user={user} size="xxxs" />,
		user,
	}));
}
