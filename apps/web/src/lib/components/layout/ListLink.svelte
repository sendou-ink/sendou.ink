<script lang="ts">
	import type { Snippet } from "svelte";
	import Avatar from "#lib/components/Avatar.svelte";

	interface Props {
		children: Snippet;
		to: string;
		onclick?: () => void;
		isActive?: boolean;
		imageUrl?: string;
		overlayIconUrl?: string;
		user?: {
			discordId: string;
			discordAvatar: string | null;
			customAvatarUrl?: string | null;
		};
		subtitle?: string | Snippet;
		badge?: string | Snippet;
		badgeVariant?: "default" | "warning";
	}

	let {
		children,
		to,
		onclick,
		isActive,
		imageUrl,
		overlayIconUrl,
		user,
		subtitle,
		badge,
		badgeVariant,
	}: Props = $props();
</script>

<a
	href={to}
	data-testid="list-link"
	class="listLink"
	{onclick}
	aria-current={isActive ? "page" : undefined}
>
	{#if user}
		<Avatar {user} size="xxsm" />
	{:else if imageUrl}
		<div class="listLinkImageContainer">
			<img src={imageUrl} alt="" class="listLinkImage" />
			{#if overlayIconUrl}
				<img src={overlayIconUrl} alt="" class="listLinkOverlayIcon" />
			{/if}
		</div>
	{/if}
	<div class="listLinkContent">
		<span class="listLinkTitle">{@render children()}</span>
		{#if subtitle || badge}
			<div class="listLinkSubtitleRow">
				{#if subtitle}
					<span data-testid="list-item-subtitle" class="listLinkSubtitle">
						{#if typeof subtitle === "string"}{subtitle}{:else}{@render subtitle()}{/if}
					</span>
				{/if}
				{#if typeof badge === "string"}
					<span
						data-testid="list-item-badge"
						class={["listLinkBadge", { listLinkBadgeWarning: badgeVariant === "warning" }]}
					>
						{badge}
					</span>
				{:else if badge}
					{@render badge()}
				{/if}
			</div>
		{/if}
	</div>
</a>

<style>
	.listLink {
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

		&:hover {
			&:not(:has(.listLinkSubtitle)) {
				color: var(--color-text);
			}
			background-color: var(--color-bg-high);
		}

		&[aria-current="page"] {
			color: var(--color-text);
			background-color: var(--color-bg-higher);
			font-weight: var(--weight-bold);
		}
	}

	.listLinkImageContainer {
		position: relative;
		flex-shrink: 0;
	}

	.listLinkImage {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-avatar);
		object-fit: cover;
		flex-shrink: 0;
	}

	.listLinkOverlayIcon {
		position: absolute;
		bottom: -2px;
		right: -2px;
		width: 16px;
		height: 16px;
		border-radius: var(--radius-field);
		background-color: var(--color-bg);
		padding: 2px;
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
