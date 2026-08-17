<script lang="ts">
import { SendHorizontal } from "@lucide/svelte";
import { Button } from "@sendou/components";
import Avatar from "#lib/components/Avatar.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { databaseTimestampToJavascriptTimestamp } from "#lib/utils/dates.ts";
import { CHAT } from "../chat-constants.ts";
import type { ChatMessageContext, ChatSystemMessageType } from "../chat-types.ts";
import { getChatRoom, markChatRoomRead, sendChatMessage } from "../chat.remote.ts";

interface Props {
	chatRoomId: number;
	class?: string;
	messagesContainerClass?: string;
}

interface PendingMessage {
	key: number;
	contents: string;
	/** Confirmed once the stream delivers an own message with a bigger id. */
	afterMessageId: number;
}

let { chatRoomId, class: className, messagesContainerClass }: Props = $props();

const room = $derived(getChatRoom({ chatRoomId }));
const snapshot = $derived(room.current);
const me = $derived(loggedInUser());

let inputValue = $state("");
let pendingMessages = $state<PendingMessage[]>([]);
let nextPendingKey = 0;
let messagesContainer = $state<HTMLDivElement | null>(null);
let stickToBottom = $state(true);
let unseenBelowScroll = $state(false);

const canSend = $derived(snapshot ? snapshot.lifecycle !== "ARCHIVED" : false);
// sending is a plain HTTP command, so a dropped live stream doesn't block it;
// only a room we haven't loaded yet (or an archived one) does
const sendingDisabled = $derived(!canSend);
const lastMessageId = $derived(snapshot?.messages.at(-1)?.id ?? null);

// optimistically shown messages that the live stream hasn't confirmed yet
const visiblePendingMessages = $derived(
	pendingMessages.filter(
		(pending) =>
			!snapshot?.messages.some(
				(message) =>
					message.id > pending.afterMessageId &&
					message.userId === me?.id &&
					message.contents === pending.contents,
			),
	),
);

function systemMessageText(message: {
	type?: ChatSystemMessageType | null;
	context?: ChatMessageContext | null;
}) {
	const name = message.context?.name ?? "";

	switch (message.type) {
		case "MAP_REPLAYED":
			return m.common_chat_systemMsg_mapReplayed({ name });
		case "MAP_PICKED":
			return m.common_chat_systemMsg_mapPicked({ name });
		default:
			return null;
	}
}

async function handleSubmit(event: SubmitEvent) {
	event.preventDefault();

	const contents = inputValue.trim();
	if (contents.length === 0 || sendingDisabled) return;

	const pending: PendingMessage = {
		key: ++nextPendingKey,
		contents,
		afterMessageId: lastMessageId ?? 0,
	};
	// confirmed leftovers from earlier sends get pruned while appending
	pendingMessages = [...visiblePendingMessages, pending];
	inputValue = "";
	stickToBottom = true;
	requestAnimationFrame(scrollToBottom);

	try {
		await sendChatMessage({ chatRoomId, contents });
	} catch {
		// put the unsent text back in the input so the user can retry
		pendingMessages = pendingMessages.filter(
			(other) => other.key !== pending.key,
		);
		inputValue = contents;
	}
}

function formatTimestamp(createdAt: number) {
	const timestamp = databaseTimestampToJavascriptTimestamp(createdAt);
	const moreThanDayAgo = Date.now() - timestamp > 24 * 60 * 60 * 1000;

	return new Intl.DateTimeFormat(
		getLocale(),
		moreThanDayAgo
			? { day: "numeric", month: "numeric", hour: "numeric", minute: "numeric" }
			: { hour: "numeric", minute: "numeric" },
	).format(new Date(timestamp));
}

function handleScroll() {
	if (!messagesContainer) return;
	const distanceFromBottom =
		messagesContainer.scrollHeight -
		messagesContainer.scrollTop -
		messagesContainer.clientHeight;
	stickToBottom = distanceFromBottom < 24;
	if (stickToBottom) {
		unseenBelowScroll = false;
	}
}

function scrollToBottom() {
	if (!messagesContainer) return;
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
	stickToBottom = true;
	unseenBelowScroll = false;
}

let lastMarkedRead: number | null = null;

// new messages: follow the conversation when pinned to the bottom, otherwise
// surface the "new messages" affordance; reading marks the room seen
$effect(() => {
	if (lastMessageId === null) return;

	if (stickToBottom) {
		requestAnimationFrame(scrollToBottom);
	} else {
		unseenBelowScroll = true;
	}

	if (lastMarkedRead !== lastMessageId) {
		lastMarkedRead = lastMessageId;
		markChatRoomRead({ chatRoomId, lastSeenMessageId: lastMessageId }).catch(
			() => {
				lastMarkedRead = null;
			},
		);
	}
});
</script>

<section class={["container", className]}>
	<div class="inputContainer">
		<!-- xxx: the React app virtualizes this list (react-aria Virtualizer + ListLayout); no virtualizer here yet -->
		<div
			bind:this={messagesContainer}
			class={["messages scrollbar", messagesContainerClass]}
			role="log"
			aria-label="Chat messages"
			onscroll={handleScroll}
		>
			{#if !snapshot}
				<div class="streamStatus">{m.common_chat_connecting()}</div>
			{/if}
			{#each snapshot?.messages ?? [] as message (message.id)}
				{@const systemText = systemMessageText(message)}
				{#if systemText}
					<div class="message">
						<div>
							<div class="stack horizontal sm">
								<time class="messageTime">
									{formatTimestamp(message.createdAt)}
								</time>
							</div>
							<div class="messageContents text-xs text-lighter font-semi-bold">
								{systemText}
							</div>
						</div>
					</div>
				{:else if message.userId !== null && snapshot?.users[message.userId]}
					{@const user = snapshot.users[message.userId]}
					<div class="message">
						<div class="avatarWrapper">
							<Avatar {user} size="xs" />
						</div>
						<div>
							<div class="messageInfo">
								<div
									class="messageUser"
									style:--chat-hue={user.chatNameHue ?? undefined}
								>
									{user.username}
								</div>
								{#if user.pronouns}
									<span class="pronounsTag">
										{user.pronouns.subject}/{user.pronouns.object}
									</span>
								{/if}
								<time class="messageTime">
									{formatTimestamp(message.createdAt)}
								</time>
							</div>
							<div class="messageContents">
								{message.contents}
							</div>
						</div>
					</div>
				{/if}
			{/each}
			{#if me}
				{@const meAsChatUser = snapshot?.users[me.id]}
				{#each visiblePendingMessages as pending (pending.key)}
					<div class="message">
						<div class="avatarWrapper">
							<Avatar user={meAsChatUser ?? me} size="xs" />
						</div>
						<div>
							<div class="messageInfo">
								<div
									class="messageUser"
									style:--chat-hue={meAsChatUser?.chatNameHue ?? undefined}
								>
									{me.username}
								</div>
								{#if meAsChatUser?.pronouns}
									<span class="pronounsTag">
										{meAsChatUser.pronouns.subject}/{meAsChatUser.pronouns
											.object}
									</span>
								{/if}
							</div>
							<div class="messageContents messageContentsPending">
								{pending.contents}
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
		{#if unseenBelowScroll}
			<button type="button" class="unseenMessages" onclick={scrollToBottom}>
				{m.common_chat_newMessages()}
			</button>
		{/if}
		{#if snapshot && !room.connected}
			<div class="streamStatus warning">{m.common_chat_disconnected()}</div>
		{/if}
		{#if snapshot && !canSend}
			<div class="text-xs text-lighter text-center my-4">
				{m.common_chat_expired()}
			</div>
		{:else}
			<form onsubmit={handleSubmit}>
				<input
					class="text-xs"
					bind:value={inputValue}
					placeholder={m.common_chat_input_placeholder()}
					disabled={sendingDisabled}
					maxlength={CHAT.MESSAGE_MAX_LENGTH}
				/>
				<Button
					type="submit"
					size="small"
					shape="circle"
					class="sendButton"
					disabled={sendingDisabled}
					aria-label={m.common_chat_send()}
					testId="chat-submit-button"
				>
					{#snippet icon()}<SendHorizontal size={16} />{/snippet}
				</Button>
			</form>
		{/if}
	</div>
</section>

<style>
	.container {
		display: flex;
		flex-direction: column;
	}

	.messages {
		padding: var(--s-3) var(--s-2) 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		height: 310px;
		overflow-x: hidden;
		overflow-y: auto;
	}

	.message {
		list-style: none;
		display: flex;
		gap: var(--s-3);
		flex-shrink: 0;
	}

	.messageInfo {
		display: flex;
		flex-direction: row;
		gap: 0 var(--s-1-5);
		align-items: center;
		flex-wrap: wrap;
	}

	.avatarWrapper {
		position: relative;
		flex-shrink: 0;
	}

	.messageUser {
		font-weight: var(--weight-semi);
		font-size: var(--font-sm);
		color: oklch(from var(--color-text-accent) l c var(--chat-hue));
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.messageTime {
		font-size: var(--font-2xs);
		color: var(--color-text-high);
	}

	.streamStatus {
		font-size: var(--font-2xs);
		font-weight: var(--weight-semi);
		color: var(--color-text-high);
		text-align: center;
		padding: var(--s-2);

		&.warning {
			color: var(--color-warning);
			padding: 0 var(--s-2);
		}
	}

	.pronounsTag {
		background-color: var(--color-bg-higher);
		color: var(--color-text-accent);
		font-size: var(--font-2xs);
		font-weight: var(--weight-semi);
		padding: 1px 5px;
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	.inputContainer {
		margin-top: auto;
		position: relative;

		& > form {
			display: flex;
			align-items: center;
			gap: var(--s-1-5);
			padding: var(--s-1-5);
			border-top: 1.5px solid var(--color-border);
			margin-block-start: var(--s-4);

			& > input {
				flex: 1;
				min-width: 0;
			}
		}
	}

	.inputContainer :global(.sendButton) {
		background-color: var(--color-text-accent);
		color: var(--color-text-inverse);
		flex-shrink: 0;

		&:disabled {
			opacity: 0.4;
		}
	}

	.messageContents {
		font-size: var(--font-sm);
		word-break: break-word;
	}

	.messageContentsPending {
		opacity: 0.7;
	}

	.unseenMessages {
		position: absolute;
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		border-radius: var(--radius-field);
		background-color: var(--color-bg-higher);
		border: none;
		color: var(--color-text);
		bottom: 60px;
		right: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		height: 25px;
		width: max-content;
		cursor: pointer;
	}
</style>
