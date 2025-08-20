<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { Pagination } from '$lib/runes/pagination.svelte';
	import Button from './buttons/Button.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface Props {
		items: T[];
		pageSize: number;
		scrollToTop?: boolean;
		paginateTop?: boolean;
		child: Snippet<[{ items: T[] }]>;
	}

	let { items, pageSize, scrollToTop, paginateTop, child }: Props = $props();

	const pagination = new Pagination(() => items, {
		pageSize,
		scrollToTop
	});
</script>

{#if paginateTop}
	{@render ui()}
{/if}
{@render child({ items: pagination.itemsOnPage })}
{@render ui()}

{#snippet ui()}
	{#if !pagination.everythingVisible}
		<div class="container">
			<Button
				icon={ChevronLeft}
				variant="outlined"
				onclick={() => pagination.previousPage()}
				disabled={pagination.page === 1}
			/>
			<div class="dots">
				{#each { length: pagination.pagesCount }, i}
					<Button
						class={pagination.page === i + 1 ? 'active' : ''}
						variant="minimal"
						onclick={() => pagination.setPage(i + 1)}
					/>
				{/each}
			</div>
			<div class="count">
				<p>{pagination.page} / {pagination.pagesCount}</p>
			</div>
			<Button
				icon={ChevronRight}
				variant="outlined"
				onclick={() => pagination.nextPage()}
				disabled={pagination.page === pagination.pagesCount}
			/>
		</div>
	{/if}
{/snippet}

<style>
	.container {
		display: grid;
		grid-template-columns: auto auto auto;
		gap: var(--s-4);
		align-items: center;
		justify-items: center;
		justify-content: center;
	}

	.count {
		display: block;
		font-size: var(--fonts-sm);
		font-weight: 600;

		@media (min-width: 640px) {
			display: none;
		}
	}

	.dots {
		display: none;
		align-items: center;
		justify-content: center;
		gap: var(--s-1);
		flex-wrap: wrap;

		@media (min-width: 640px) {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		:global(button) {
			background-color: var(--color-base-card);
			padding: var(--s-1);

			&.active {
				background-color: var(--color-primary);
			}
		}
	}
</style>
