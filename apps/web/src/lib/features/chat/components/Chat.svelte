<script lang="ts">
import { SendHorizontal } from "@lucide/svelte";
import { Button } from "@sendou/components";
import Avatar from "#lib/components/Avatar.svelte";
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

let { chatRoomId, class: className, messagesContainerClass }: Props = $props();

const room = $derived(getChatRoom({ chatRoomId }));
const snapshot = $derived(room.current);

let inputValue = $state("");
let sendPending = $state(false);
let messagesContainer = $state<HTMLDivElement | null>(null);
let stickToBottom = $state(true);
let unseenBelowScroll = $state(false);

const canSend = $derived(snapshot ? snapshot.lifecycle !== "ARCHIVED" : false);
const sendingDisabled = $derived(!canSend || !room.connected || sendPending);

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
	if (contents.length === 0) return;

	sendPending = true;
	try {
		await sendChatMessage({ chatRoomId, contents });
		inputValue = "";
		stickToBottom = true;
	} catch {
		// keep the unsent text in the input so the user can retry
	} finally {
		sendPending = false;
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

const lastMessageId = $derived(snapshot?.messages.at(-1)?.id ?? null);
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
		<div
			bind:this={messagesContainer}
			class={["messages scrollbar", messagesContainerClass]}
			role="log"
			aria-label="Chat messages"
			onscroll={handleScroll}
		>
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
		</div>
		{#if unseenBelowScroll}
			<button type="button" class="unseenMessages" onclick={scrollToBottom}>
				{m.common_chat_newMessages()}
			</button>
		{/if}
		{#if snapshot && !canSend}
			<div class="text-xs text-lighter text-center my-4">
				{m.common_chat_expired()}
			</div>
		{:else}
			<form onsubmit={handleSubmit}>
				<input
					class="w-full text-xs"
					bind:value={inputValue}
					placeholder={m.common_chat_input_placeholder()}
					disabled={sendingDisabled}
					maxlength={CHAT.MESSAGE_MAX_LENGTH}
				/>
				<div class="bottomRow">
					{#if room.connected}
						<div class="text-xxs font-semi-bold text-lighter">
							{m.common_chat_connected()}
						</div>
					{:else if !room.done}
						<div class="text-xxs font-semi-bold text-lighter">
							{m.common_chat_connecting()}
						</div>
					{:else}
						<div class="text-xxs font-semi-bold text-warning">
							{m.common_chat_disconnected()}
						</div>
					{/if}
					<Button
						type="submit"
						size="small"
						class="sendButton"
						disabled={sendingDisabled}
						aria-label={m.common_chat_send()}
						testId="chat-submit-button"
					>
						{#snippet icon()}<SendHorizontal size={16} />{/snippet}
					</Button>
				</div>
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
		padding: var(--s-3) 0 0 0;
		display: block;
		height: 310px;
		overflow-x: hidden;
		overflow-y: auto;
	}

	.message {
		list-style: none;
		display: flex;
		gap: var(--s-3);
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

	.inputContainer {
		margin-top: auto;
		position: relative;

		& > form {
			padding: var(--s-2);
			border-top: 1.5px solid var(--color-border);
			margin-block-start: var(--s-4);
		}
	}

	.inputContainer :global(.sendButton) {
		border-radius: var(--radius-full);
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

	.bottomRow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-block-start: var(--s-2);
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
