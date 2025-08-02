<script lang="ts">
	import type { Tables } from '$lib/server/db/tables';
	import type { Unpacked } from '$lib/utils/types';
	import { fly, scale } from 'svelte/transition';
	import { badgeExplanationText } from '$lib/utils/badges';
	import { Pagination } from '$lib/runes/pagination.svelte';
	import TrashIcon from '$lib/components/icons/trash.svelte';
	import Badge from '$lib/components/badge.svelte';
	import Button from '$lib/components/button.svelte';

	const SMALL_BADGES_PER_DISPLAY_PAGE = 9;

	interface Props {
		badges: Array<Omit<Tables['Badge'], 'authorId'> & { count?: number }>;
		onChange?: (badgeIds: number[]) => void;
		children?: import('svelte').Snippet;
		showText?: boolean;
		class?: string;
	}

	let { badges, onChange, children, showText = true, class: className }: Props = $props();

	const bigBadge = $derived(badges[0]);
	const smallBadges = $derived(badges.slice(1));

	const isPaginated = $derived(!onChange);
	const pagination = $derived(
		new Pagination(() => smallBadges, {
			pageSize: isPaginated ? SMALL_BADGES_PER_DISPLAY_PAGE : 1000,
			scrollToTop: false
		})
	);

	function setBadgeFirst(badge: Unpacked<Props['badges']>) {
		const newBadges = badges.map((b, i) => {
			if (i === 0) return badge;
			if (b.id === badge.id) return badges[0];
			return b;
		});

		badges = newBadges;
		onChange?.(newBadges.map((b) => b.id));
	}

	function removeBadge() {
		if (!bigBadge || !onChange) return;
		onChange(badges.filter((b) => b.id !== bigBadge.id).map((b) => b.id));
	}
</script>

{#if bigBadge}
	<div data-testid="badge-display">
		{#if isPaginated && showText}
			<div class="badgeExplanation">
				{badgeExplanationText(bigBadge)}
			</div>
		{/if}

		<div
			class={[
				className,
				'badges',
				{
					'justify-center': smallBadges.length === 0
				}
			]}
		>
			{#key bigBadge.id}
				<div in:scale={{ duration: 100, start: 0.7 }}>
					<Badge badge={bigBadge} size={125} isAnimated />
				</div>
			{/key}

			<!-- xxx: would be nice if the animation also went slightly left or right -->
			{#if !children && smallBadges.length > 0}
				<div class="smallBadges">
					{#each pagination.itemsOnPage as badge (badge.id)}
						<div class="smallBadgeContainer" in:fly={{ duration: 500 }}>
							<Badge {badge} onclick={() => setBadgeFirst(badge)} size={48} isAnimated />
							{#if badge.count && badge.count > 1}
								<div class="smallBadgeCount">×{badge.count}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{@render children?.()}
		</div>

		{#if !isPaginated}
			<div class="badgeExplanation">
				{badgeExplanationText(bigBadge)}
				<Button variant="minimal-destructive" onclick={removeBadge}>
					{#snippet icon()}
						<TrashIcon />
					{/snippet}
				</Button>
			</div>
		{/if}

		{#if !pagination.everythingVisible}
			<div class="pagination">
				{#each { length: pagination.pagesCount }, i}
					<Button
						variant="minimal"
						aria-label={`Badges page ${i + 1}`}
						onclick={() => pagination.setPage(i + 1)}
						class={[
							'paginationButton',
							{
								paginationButtonActive: pagination.page === i + 1
							}
						]}
						data-testid="badge-pagination-button"
					>
						{i + 1}
					</Button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.badges {
		display: flex;
		width: 20rem;
		min-height: 12rem;
		align-items: center;
		padding: var(--s-2);
		border-radius: var(--rounded);
		background-color: var(--bg-badge);
		margin-inline: auto;
		margin-block: var(--s-2);
	}

	.smallBadges {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 0 auto;
		cursor: pointer;
		gap: var(--s-3);
	}

	.badgeExplanation {
		color: var(--text-lighter);
		font-size: var(--fonts-xs);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.smallBadgeContainer {
		position: relative;
	}

	.smallBadgeCount {
		position: absolute;
		top: 0;
		right: 0;
		margin-top: -8px;
		margin-right: auto;
		margin-left: auto;
		color: var(--theme-vibrant);
		font-size: var(--fonts-xxxs);
		font-weight: var(--bold);
	}

	.pagination {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2-5);
		justify-content: center;
		align-items: center;
		width: 20rem;
		margin: 0 auto;

		:global(.paginationButton) {
			background-color: var(--bg-darker);
			border-radius: 100%;
			padding: var(--s-1);
			height: 24px;
			width: 24px;
			border: 2px solid var(--border);
			font-size: var(--fonts-xs);
			color: var(--text-lighter);
		}

		:global(.paginationButtonActive) {
			color: var(--theme);
			background-color: var(--bg-lightest);
		}
	}
</style>
