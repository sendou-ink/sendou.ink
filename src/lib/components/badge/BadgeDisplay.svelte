<script lang="ts">
	import type { Tables } from '$lib/server/db/tables';
	import type { Unpacked } from '$lib/utils/types';
	import { fly, scale } from 'svelte/transition';
	import { badgeExplanationText } from '$lib/utils/badges';
	import { Pagination } from '$lib/runes/pagination.svelte';
	import Badge from './Badge.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';

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
			<div class="badge-explanation">
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
				<div class="small-badges">
					{#each pagination.itemsOnPage as badge (badge.id)}
						<div class="small-badge-container" in:fly={{ duration: 500 }}>
							<Badge {badge} onclick={() => setBadgeFirst(badge)} size={48} isAnimated />
							{#if badge.count && badge.count > 1}
								<div class="small-badge-count">×{badge.count}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{@render children?.()}
		</div>

		{#if !isPaginated}
			<div class="badge-explanation">
				{badgeExplanationText(bigBadge)}
				<Button variant="minimal-destructive" icon={Trash2} onclick={removeBadge}></Button>
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
							'pagination-button',
							{
								'pagination-button-active': pagination.page === i + 1
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
		border-radius: var(--radius-box);
		background-color: #000;
		margin-inline: auto;
		margin-block: var(--s-2);
	}

	.small-badges {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 0 auto;
		cursor: pointer;
		gap: var(--s-3);
	}

	.badge-explanation {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.small-badge-container {
		position: relative;
	}

	.small-badge-count {
		position: absolute;
		top: 0;
		right: 0;
		margin-top: -8px;
		margin-right: auto;
		margin-left: auto;
		color: var(--color-secondary);
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

		:global(.pagination-button) {
			background-color: var(--color-base-section);
			border-radius: 100%;
			padding: var(--s-1);
			height: 24px;
			width: 24px;
			border: var(--border-style);
			font-size: var(--fonts-xs);
			color: var(--color-base-content-secondary);
		}

		:global(.pagination-button-active) {
			color: var(--color-secondary);
			background-color: var(--color-base-card);
		}
	}
</style>
