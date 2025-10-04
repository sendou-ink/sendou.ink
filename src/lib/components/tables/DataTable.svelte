<script lang="ts" generics="TData, TValue">
	import {
		type ColumnDef,
		type ColumnFiltersState,
		type PaginationState,
		type RowSelectionState,
		type SortingState,
		type VisibilityState,
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel
	} from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages';
	import { FlexRender, createSvelteTable } from './internals';
	import Table from './Table.svelte';
	import VisibilityMenu from './builders/VisibilityMenu.svelte';
	import ColumnFilter from './builders/ColumnFilter.svelte';
	import RowPagination from './builders/RowPagination.svelte';
	import SelectionInfo from './builders/SelectionInfo.svelte';

	type Props<TData, TValue> = {
		columns: ColumnDef<TData, TValue>[];
		data: TData[];
		pageSize?: number;
		withSelection?: boolean;
		filterColumn?: keyof TData & string;
		toggleColumns?: (keyof TData & string)[];
	};

	let {
		columns,
		data,
		pageSize,
		withSelection,
		filterColumn,
		toggleColumns
	}: Props<TData, TValue> = $props();

	let selection = $state<RowSelectionState>({});
	let sorting = $state<SortingState>([]);
	let filters = $state<ColumnFiltersState | undefined>(filterColumn ? [] : undefined);
	let visibility = $state<VisibilityState | undefined>(toggleColumns ? {} : undefined);
	let pagination = $derived<PaginationState | undefined>(
		pageSize ? { pageIndex: 0, pageSize } : undefined
	);

	const table = createSvelteTable({
		get data() {
			return data;
		},
		columns,
		state: {
			get rowSelection() {
				return selection;
			},
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return filters;
			},
			get columnVisibility() {
				return visibility;
			},
			get pagination() {
				if (!pagination) {
					return {
						pageIndex: 0,
						pageSize: data.length
					};
				}
				return pagination;
			}
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				selection = updater(selection);
			} else {
				selection = updater;
			}
		},
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (!filters) return;

			if (typeof updater === 'function') {
				filters = updater(filters);
			} else {
				filters = updater;
			}
		},
		onColumnVisibilityChange: (updater) => {
			if (!visibility) return;

			if (typeof updater === 'function') {
				visibility = updater(visibility);
			} else {
				visibility = updater;
			}
		},
		onPaginationChange: (updater) => {
			if (!pagination) return;

			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});
</script>

<div class="container">
	<div class="top-controls">
		<span>
			<ColumnFilter {table} {filterColumn} />
		</span>
		<span>
			<VisibilityMenu {table} {toggleColumns} />
		</span>
	</div>
	<Table>
		<thead>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<tr>
					{#each headerGroup.headers as header (header.id)}
						<th colspan={header.colSpan}>
							{#if !header.isPlaceholder}
								<FlexRender
									content={header.column.columnDef.header}
									context={header.getContext()}
								/>
							{/if}
						</th>
					{/each}
				</tr>
			{/each}
		</thead>
		<tbody>
			{#each table.getRowModel().rows as row (row.id)}
				<tr data-state={row.getIsSelected() && 'selected'}>
					{#each row.getVisibleCells() as cell (cell.id)}
						<td>
							<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
						</td>
					{/each}
				</tr>
			{:else}
				<tr>
					<td class="empty" colspan={columns.length}>{m.tables_noData()}</td>
				</tr>
			{/each}
		</tbody>
	</Table>
	<div class="bottom-controls">
		<span>
			{#if withSelection}
				<SelectionInfo {table} />
			{/if}
		</span>
		<span>
			<RowPagination {table} {pageSize} />
		</span>
	</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
	}

	.top-controls,
	.bottom-controls {
		display: flex;
		gap: var(--s-2);
		justify-content: space-between;
		align-items: center;
		font-size: var(--fonts-xs);
		color: var(--color-base-content-secondary);
	}

	.empty {
		text-align: center;
		padding: var(--s-4) 0;
		color: var(--color-base-content-secondary);
	}
</style>
