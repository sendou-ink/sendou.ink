<script lang="ts" generics="TData">
	import type { Table } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages';
	import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
	import Button from '$lib/components/buttons/Button.svelte';

	interface Props {
		table: Table<TData>;
		pageSize: number | undefined;
	}

	let { table, pageSize }: Props = $props();
</script>

{#if pageSize}
	<div class="container">
		<div class="controls">
			<Button
				variant="outlined"
				icon={ChevronsLeft}
				onclick={() => table.firstPage()}
				disabled={!table.getCanPreviousPage()}
			/>
			<Button
				variant="outlined"
				icon={ChevronLeft}
				onclick={() => table.previousPage()}
				disabled={!table.getCanPreviousPage()}
			/>
		</div>
		<p>
			{m.tables_pagination_info({
				current: table.getState().pagination.pageIndex + 1,
				total: table.getPageCount()
			})}
		</p>
		<div class="controls">
			<Button
				variant="outlined"
				icon={ChevronRight}
				onclick={() => table.nextPage()}
				disabled={!table.getCanNextPage()}
			/>
			<Button
				variant="outlined"
				icon={ChevronsRight}
				onclick={() => table.lastPage()}
				disabled={!table.getCanNextPage()}
			/>
		</div>
	</div>
{/if}

<style>
	.container {
		display: grid;
		grid-template-columns: auto auto auto;
		gap: var(--s-4);
		align-items: center;
		justify-items: center;
		justify-content: center;
		font-size: var(--fonts-xs);
	}

	.controls {
		display: flex;
		gap: var(--s-2);
	}
</style>
