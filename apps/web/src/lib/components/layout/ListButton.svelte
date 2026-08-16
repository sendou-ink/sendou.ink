<script lang="ts">
	import type { Snippet } from "svelte";
	import Avatar from "#lib/components/Avatar.svelte";

	interface Props {
		children: Snippet;
		user?: {
			discordId: string;
			discordAvatar: string | null;
			customAvatarUrl?: string | null;
		};
		subtitle?: string | null;
		badge?: string | null;
		badgeVariant?: "default" | "warning";
		onclick?: () => void;
		"aria-expanded"?: boolean;
		"aria-haspopup"?: "menu" | "dialog";
	}

	let {
		children,
		user,
		subtitle,
		badge,
		badgeVariant,
		onclick,
		"aria-expanded": ariaExpanded,
		"aria-haspopup": ariaHaspopup,
	}: Props = $props();
</script>

<button
	type="button"
	data-testid="list-button"
	class="listButton"
	{onclick}
	aria-expanded={ariaExpanded}
	aria-haspopup={ariaHaspopup}
>
	{#if user}
		<Avatar {user} size="xxsm" />
	{/if}
	<div class="listLinkContent">
		<span class="listLinkTitle">{@render children()}</span>
		{#if subtitle || badge}
			<div class="listLinkSubtitleRow">
				{#if subtitle}
					<span data-testid="list-item-subtitle" class="listLinkSubtitle">
						{subtitle}
					</span>
				{/if}
				{#if badge}
					<span
						data-testid="list-item-badge"
						class={["listLinkBadge", { listLinkBadgeWarning: badgeVariant === "warning" }]}
					>
						{badge}
					</span>
				{/if}
			</div>
		{/if}
	</div>
</button>

<style>
	.listButton {
		font-size: var(--font-xs);
		color: var(--color-text);
		text-decoration: none;
		padding: var(--s-1) var(--s-2);
		border-radius: var(--radius-field);
		transition:
			background-color 0.15s,
			color 0.15s;
		display: flex;
		align-items: center;
		gap: var(--s-2);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		width: 100%;

		&:hover {
			&:not(:has(.listLinkSubtitle)) {
				color: var(--color-text);
			}
			background-color: var(--color-bg-high);
		}

		&:focus-visible {
			outline: var(--focus-ring);
		}
	}

	.listLinkContent {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: var(--s-0-5);
		width: 100%;
	}

	.listLinkTitle {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.listLinkSubtitleRow {
		display: flex;
		align-items: center;
		gap: var(--s-1-5);
		width: 100%;
		color: var(--color-text-high);
	}

	.listLinkSubtitle {
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.listLinkBadge {
		display: flex;
		align-items: center;
		margin-left: auto;
		font-size: var(--font-2xs);
		font-weight: var(--weight-semi);
		color: var(--color-text-inverse);
		background-color: var(--color-text-accent);
		padding: 0 var(--s-1);
		border-radius: var(--radius-selector);
		height: var(--selector-size-xs);
		text-align: center;
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.listLinkBadgeWarning {
		background-color: var(--color-text-second);
	}
</style>
