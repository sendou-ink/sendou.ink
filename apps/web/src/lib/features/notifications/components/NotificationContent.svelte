<script lang="ts">
	import { Bell, ChevronRight } from "@lucide/svelte";
	import type { NotificationRow } from "#lib/components/layout/layout-types.ts";
	import { m } from "#lib/paraglide/messages.js";
	import { NOTIFICATIONS_URL } from "#lib/utils/urls.ts";
	import NotificationItem from "./NotificationItem.svelte";

	const PEEK_COUNT = 6;

	interface Props {
		notifications: NotificationRow[];
		unseenIds: number[];
		onClose?: () => void;
	}

	let { notifications, unseenIds, onClose }: Props = $props();

	// unseen highlights stay visible while the popover is open even though the
	// rows get marked seen server-side the moment it opens
	// svelte-ignore state_referenced_locally -- capturing the initial value is the point
	const stickyUnseenIds = new Set(unseenIds);
</script>

<h2 class="header">
	<Bell />
	{m.common_notifications_title()}
</h2>
<hr class="divider" />
{#if notifications.length === 0}
	<div class="noNotifications">
		{m.common_notifications_empty()}
	</div>
{:else}
	<div>
		{#each notifications as notification, i (notification.id)}
			<NotificationItem
				{notification}
				unseen={stickyUnseenIds.has(notification.id)}
				{onClose}
			/>
			{#if i !== notifications.length - 1}
				<hr class="itemDivider" />
			{/if}
		{/each}
	</div>
{/if}
{#if notifications.length === PEEK_COUNT}
	<div>
		<hr class="divider" />
		<a
			href={NOTIFICATIONS_URL}
			class="viewAllLink"
			data-testid="notifications-see-all-button"
			onclick={onClose}
		>
			{m.common_actions_viewAll()}
			<ChevronRight size={14} />
		</a>
	</div>
{/if}

<style>
	.header {
		display: flex;
		align-items: center;
		font-size: var(--font-sm);
		gap: var(--s-2);
		padding: var(--s-1) var(--s-2);

		& :global(svg) {
			min-width: 18px;
			min-height: 18px;
			max-width: 18px;
			max-height: 18px;
		}
	}

	.noNotifications {
		display: grid;
		place-items: center;
		font-weight: var(--weight-semi);
		color: var(--color-text-high);
		margin-block-start: 65px;
	}

	.divider {
		border-color: var(--color-border);
	}

	.itemDivider {
		margin-inline: var(--s-3);
		border-width: 0.5px;
		border-color: var(--color-bg-high);
	}

	.viewAllLink {
		display: flex;
		align-items: center;
		gap: 2px;
		width: fit-content;
		margin: var(--s-2) auto;
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		text-decoration: none;
		padding: 0 var(--s-3);
		height: var(--selector-size);
		background-color: var(--color-bg-high);
		border-radius: var(--radius-field);

		& :global(svg) {
			stroke-width: 3;
		}

		&:hover {
			color: var(--color-text);
			background-color: var(--color-bg-higher);
		}
	}

	@media screen and (max-width: 599px) {
		.viewAllLink {
			margin-top: var(--s-4);
		}
	}
</style>
