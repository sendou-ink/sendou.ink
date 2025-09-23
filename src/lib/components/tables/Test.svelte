<script lang="ts" generics="TData, TValue">
	import { type ColumnDef, getCoreRowModel } from '@tanstack/table-core';
	import { createSvelteTable, FlexRender } from './internals';
	import Table from './Table.svelte';

	interface Props {
		columns: ColumnDef<TData, TValue>[];
		data: TData[];
	}

	let { columns, data }: Props = $props();

	const table = createSvelteTable({
		get data() {
			return data;
		},
		columns,
		getCoreRowModel: getCoreRowModel()
	});
</script>

<Table>
	<thead>
		{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
			<tr>
				{#each headerGroup.headers as header (header.id)}
					<th>
						{#if !header.isPlaceholder}
							<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
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
		{/each}
	</tbody>
</Table>
