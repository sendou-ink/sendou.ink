<script lang="ts" generics="TData">
	import type { Table } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages';

	interface Props<TData> {
		table: Table<TData>;
	}

	let { table }: Props<TData> = $props();
</script>

<p>
	{m.tables_selection_info({
		selected: table.getFilteredSelectedRowModel().rows.length,
		total: table.getFilteredRowModel().rows.length
	})}
</p>
