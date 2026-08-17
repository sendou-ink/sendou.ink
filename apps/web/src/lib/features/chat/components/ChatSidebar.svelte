<script lang="ts">
import { ArrowLeft, MessageSquare, X } from "@lucide/svelte";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { scrimPage } from "#lib/utils/urls.ts";
import { chatUi } from "../chat-state.svelte.ts";
import { getChatRooms } from "../chat.remote.ts";
import Chat from "./Chat.svelte";

interface Props {
	onClose?: () => void;
}

let { onClose }: Props = $props();

const roomsQuery = getChatRooms();
const rooms = $derived(roomsQuery.current?.rooms ?? []);

const activeRooms = $derived(
	rooms.filter((room) => room.lifecycle === "ACTIVE"),
);
const inactiveRooms = $derived(
	rooms.filter((room) => room.lifecycle === "INACTIVE"),
);

const openRoom = $derived(
	chatUi.openRoomId !== null
		? (rooms.find((room) => room.id === chatUi.openRoomId) ?? null)
		: null,
);

const totalUnseenElsewhere = $derived(
	rooms
		.filter((room) => room.id !== chatUi.openRoomId)
		.reduce((total, room) => total + room.unseenCount, 0),
);

function roomTitle(_room: { scrimStartsAt: number | null }) {
	// every room belongs to a scrim until other room types migrate
	return m.common_chat_room_scrim();
}

function roomSubtitle(room: { scrimStartsAt: number | null }) {
	if (room.scrimStartsAt === null) return "";
	return new Intl.DateTimeFormat(getLocale(), {
		weekday: "short",
		hour: "numeric",
		minute: "numeric",
	}).format(databaseTimestampToDate(room.scrimStartsAt));
}
</script>

<div class="sidebar">
	{#if openRoom}
		<div class="chatHeader">
			<button
				type="button"
				class="backButton"
				aria-label={m.common_actions_back()}
				onclick={() => {
					chatUi.openRoomId = null;
				}}
			>
				<ArrowLeft size={18} />
				{#if totalUnseenElsewhere > 0}
					<span class="backButtonBadge">{totalUnseenElsewhere}</span>
				{/if}
			</button>
			<a
				class="chatHeaderLink"
				href={openRoom.scrimPostId !== null
					? scrimPage(openRoom.scrimPostId)
					: undefined}
			>
				<div class="chatHeaderInfo">
					<div class="chatHeaderTitle">{roomTitle(openRoom)}</div>
					<div class="chatHeaderSubtitle">{roomSubtitle(openRoom)}</div>
				</div>
			</a>
			{#if onClose}
				<button
					type="button"
					class="closeButton"
					aria-label={m.common_actions_close()}
					onclick={onClose}
				>
					<X size={18} />
				</button>
			{/if}
		</div>
		<div class="chatContainer">
			{#key openRoom.id}
				<Chat chatRoomId={openRoom.id} />
			{/key}
		</div>
	{:else}
		<div class="sidebarHeader">
			<MessageSquare size={16} />
			<h2>{m.common_chat_sidebar_title()}</h2>
			{#if onClose}
				<button
					type="button"
					class="closeButton"
					aria-label={m.common_actions_close()}
					onclick={onClose}
				>
					<X size={18} />
				</button>
			{/if}
		</div>
		<div class="roomList">
			{#if rooms.length === 0}
				<div class="emptyState">
					{roomsQuery.current
						? m.common_chat_sidebar_noActiveChats()
						: m.common_chat_connecting()}
				</div>
			{:else}
				{#each activeRooms as room (room.id)}
					{@render roomItem(room)}
				{/each}
				{#if inactiveRooms.length > 0}
					<div class="inactiveDivider">
						{m.common_chat_sidebar_inactive()}
					</div>
					{#each inactiveRooms as room (room.id)}
						{@render roomItem(room)}
					{/each}
				{/if}
			{/if}
		</div>
	{/if}
</div>

{#snippet roomItem(room: (typeof rooms)[number])}
	<button
		type="button"
		class="roomItem"
		onclick={() => {
			chatUi.openRoomId = room.id;
		}}
	>
		<div class="roomItemTexts">
			<div class="roomName">{roomTitle(room)}</div>
			<div class="roomTimestamp">{roomSubtitle(room)}</div>
		</div>
		{#if room.unseenCount > 0}
			<span class="unreadBadge">{room.unseenCount}</span>
		{/if}
	</button>
{/snippet}

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: var(--visual-viewport-height, 100dvh);
		overflow: hidden;
	}

	.sidebarHeader {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding-inline: var(--s-4);
		background-color: var(--color-bg-high);
		border-bottom: 1.5px solid var(--color-border);
		flex-shrink: 0;
		color: var(--color-text-high);
		min-height: var(--layout-nav-height);

		& h2 {
			font-size: var(--font-xs);
			font-weight: var(--weight-bold);
			margin: 0;
		}
	}

	.closeButton {
		display: grid;
		place-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-error);
		height: var(--field-size);
		aspect-ratio: 1 / 1;
		padding: 0;
		border-radius: var(--radius-field);
		margin-inline-start: auto;

		@media screen and (min-width: 600px) {
			height: var(--field-size-sm);
		}

		&:hover {
			background-color: var(--color-bg-higher);
		}
	}

	.roomList {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
		padding: var(--s-1-5);
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.roomItem {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-2);
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		text-align: start;
		border-radius: var(--radius-field);

		&:hover {
			background-color: var(--color-bg-higher);
		}
	}

	.roomItemTexts {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.roomName {
		font-weight: var(--weight-semi);
		font-size: var(--font-xs);
	}

	.roomTimestamp {
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		flex-shrink: 0;
	}

	.inactiveDivider {
		padding: var(--s-1-5) var(--s-2);
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-high);
	}

	.unreadBadge {
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		color: var(--color-text-inverse);
		background-color: var(--color-text-accent);
		min-width: 18px;
		height: 18px;
		padding: 0 var(--s-1);
		border-radius: 9px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.chatHeader {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding-inline: var(--s-2);
		border-bottom: 1.5px solid var(--color-border);
		background-color: var(--color-bg-high);
		flex-shrink: 0;
		min-height: var(--layout-nav-height);
	}

	.backButton {
		position: relative;
		display: grid;
		place-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text);
		height: var(--field-size-sm);
		aspect-ratio: 1 / 1;
		border-radius: var(--radius-field);

		&:hover {
			background-color: var(--color-bg-higher);
		}
	}

	.backButtonBadge {
		position: absolute;
		top: -2px;
		right: -2px;
		font-size: var(--font-3xs);
		font-weight: var(--weight-bold);
		color: var(--color-text-inverse);
		background-color: var(--color-text-accent);
		min-width: 14px;
		height: 14px;
		padding: 0 3px;
		border-radius: 7px;
		display: grid;
		place-items: center;
		line-height: 1;
	}

	.chatHeaderInfo {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.chatHeaderLink {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1-5);
		overflow: hidden;
		min-width: 0;
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-field);
		transition: background-color 0.15s;

		&:is(a):hover {
			background-color: var(--color-bg-higher);
		}
	}

	.chatHeaderTitle {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chatHeaderSubtitle {
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.emptyState {
		padding: var(--s-4);
		text-align: center;
		color: var(--color-text-high);
		font-size: var(--font-xs);
	}

	.chatContainer {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		padding-block-start: var(--s-2);
		display: flex;
		flex-direction: column;

		& > :global(section) {
			height: 100%;
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}

		& :global(section > div) {
			flex: 1;
			display: flex;
			flex-direction: column;
			margin-top: 0;
			min-height: 0;
		}

		& :global([role="log"]) {
			padding-top: 0;
			flex: 1;
			height: auto;
		}

		& :global(form) {
			flex-shrink: 0;
		}
	}
</style>
