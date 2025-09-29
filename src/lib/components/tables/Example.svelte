<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { renderComponent, renderSnippet } from './internals';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import Circle from '@lucide/svelte/icons/circle';
	import DataTable from './DataTable.svelte';
	import SortableHeader from './builders/SortableHeader.svelte';

	type Payment = {
		id: string;
		status: 'Pending' | 'Processing' | 'Success' | 'Failed';
		email: string;
		createdAt: Date;
		amount: number;
	};

	/**
	 * Columns define the shape of the data and how to render it.
	 * We can format cells and headers by defining a function that returns a string.
	 * By using renderComponent or renderSnippet we can render Svelte components or snippets instead.
	 * The SortableHeader component can be used to create sortable columns.
	 * Docs: https://tanstack.com/table/latest/docs/guide/column-defs
	 */
	const columnsA: ColumnDef<Payment>[] = [
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }) => renderSnippet(statusCell, row.getValue('status'))
		},
		{
			accessorKey: 'email',
			header: 'Email'
		},
		{
			accessorKey: 'createdAt',
			header: ({ column }) =>
				renderComponent(SortableHeader, {
					onclick: column.getToggleSortingHandler(),
					direction: column.getIsSorted(),
					label: 'Created At'
				}),
			cell: ({ row }) => new Date(row.getValue('createdAt')).toLocaleDateString()
		},
		{
			accessorKey: 'amount',
			header: ({ column }) =>
				renderComponent(SortableHeader, {
					onclick: column.getToggleSortingHandler(),
					direction: column.getIsSorted(),
					label: 'Amount'
				}),
			cell: ({ row }) => `$ ${row.getValue('amount')}`
		}
	];

	/**
	 * A simpler table without custom cell rendering.
	 */
	const columnsB: ColumnDef<Payment>[] = [
		{
			accessorKey: 'status',
			header: 'Status'
		},
		{
			accessorKey: 'email',
			header: 'Email'
		},
		{
			accessorKey: 'createdAt',
			header: 'Created At'
		},
		{
			accessorKey: 'amount',
			header: 'Amount'
		}
	];

	/*
	 * The data which takes the shape defined by the columns,
	 * where every entry has the same keys as defined in the columns id or accessorKey.
	 */
	const dataA: Payment[] = createFakeData(50);
	const dataB: Payment[] = createFakeData(10);

	function createFakeData(count: number): Payment[] {
		const statuses: Payment['status'][] = ['Pending', 'Processing', 'Success', 'Failed'];
		const fakeData: Payment[] = [];

		for (let i = 0; i < count; i++) {
			fakeData.push({
				id: Math.random().toString(36).substring(2, 10),
				status: statuses[Math.floor(Math.random() * statuses.length)],
				email: `user${i + 1}@example.com`,
				createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000000)),
				amount: Math.floor(Math.random() * 1000) + 1
			});
		}

		return fakeData;
	}
</script>

{#snippet statusCell(status: Payment['status'])}
	{#if status === 'Success'}
		<span class="status">
			<CircleCheck />
			{status}
		</span>
	{:else if status === 'Processing'}
		<span class="status">
			<CircleDashed />
			{status}
		</span>
	{:else if status === 'Pending'}
		<span class="status">
			<Circle />
			{status}
		</span>
	{:else if status === 'Failed'}
		<span class="status">
			<CircleAlert />
			{status}
		</span>
	{/if}
{/snippet}

<!-- A table using all features -->
<DataTable
	columns={columnsA}
	data={dataA}
	filterColumn="email"
	pageSize={5}
	toggleColumns={['email', 'createdAt', 'amount']}
/>

<!-- 
A simple, static table. 
In this case it would be better to use the basic Table component instead.
-->
<DataTable columns={columnsB} data={dataB} />

<style>
	span {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
</style>
