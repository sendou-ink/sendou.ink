<script lang="ts">
import type { Snippet } from "svelte";
import NotificationDot from "#lib/components/NotificationDot.svelte";

interface Props {
	icon: Snippet;
	label: string;
	isActive: boolean;
	onPress: () => void;
	showNotificationDot?: boolean;
	unreadCount?: number;
	badgeCount?: number;
	badgeLeft?: boolean;
}

let {
	icon,
	label,
	isActive,
	onPress,
	showNotificationDot,
	unreadCount,
	badgeCount,
	badgeLeft,
}: Props = $props();

const count = $derived(unreadCount ?? badgeCount);
</script>

<button type="button" class="tab" data-active={isActive} onclick={onPress}>
	<span class="tabIcon">
		{@render icon()}
		{#if showNotificationDot}
			<NotificationDot />
		{/if}
		{#if count}
			<span class={["tabBadge", { tabBadgeLeft: badgeLeft }]}>
				{count}
			</span>
		{/if}
	</span>
	<span>{label}</span>
</button>

<style>
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0;
		height: 100%;
		aspect-ratio: 1 / 1;
		background: none;
		border: none;
		border-radius: var(--radius-field);
		color: var(--color-text-high);
		font-size: var(--font-2xs);
		font-weight: var(--weight-semi);
		cursor: pointer;
		text-decoration: none;
		transition: color 0.15s;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: -1px;
		}

		&:hover,
		&[data-active="true"] {
			color: var(--color-text-accent);
		}
	}

	.tabIcon {
		position: relative;
		width: 24px;
		height: 24px;

		& :global(svg) {
			width: 24px;
			height: 24px;
		}
	}

	.tabBadge {
		position: absolute;
		top: -4px;
		right: -8px;
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		color: var(--color-text-inverse);
		background-color: var(--color-text-accent);
		min-width: 16px;
		height: 16px;
		padding: 0 var(--s-0-5);
		border-radius: 8px;
		display: grid;
		place-items: center;
		pointer-events: none;
		line-height: 1;

		&.tabBadgeLeft {
			right: auto;
			left: -8px;
		}
	}
</style>
