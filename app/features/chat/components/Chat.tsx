import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import type { CommonUser } from "~/utils/kysely.server";
import type { ClientChatMessage } from "../chat-types";
import styles from "./Chat.module.css";
import { Composer } from "./Composer";
import { MessageLog, MessageLogFallback } from "./MessageLog";
import { MessagesContext } from "./MessagesContext";

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
							<MessageLogFallback className={messagesContainerClassName} />
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
						// only observers ever see this so we don't need translations
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
