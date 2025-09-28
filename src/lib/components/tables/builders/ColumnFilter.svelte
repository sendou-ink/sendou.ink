<script lang="ts" generics="TData">
	import type { ComponentProps } from 'svelte';
	import type { Table } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages';
	import Input from '$lib/components/Input.svelte';

	type Props<TData> = ComponentProps<typeof Input> & {
		table: Table<TData>;
		filterColumn?: keyof TData & string;
	};

	let { table, filterColumn }: Props<TData> = $props();
</script>

{#if filterColumn}
	<Input
		placeholder={`${m.common_actions_filter()} ${filterColumn}...`}
		value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ''}
		oninput={(e) => {
			table.getColumn(filterColumn)?.setFilterValue(e.currentTarget.value);
		}}
	/>
{/if}
