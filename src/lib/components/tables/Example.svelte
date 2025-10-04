<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { renderComponent, renderSnippet } from './internals';
	import { confirmAction } from '$lib/utils/form';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import Circle from '@lucide/svelte/icons/circle';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import NotepadText from '@lucide/svelte/icons/notepad-text';
	import HandCoins from '@lucide/svelte/icons/hand-coins';
	import DataTable from './DataTable.svelte';
	import SortableHeader from './builders/SortableHeader.svelte';
	import RowActions from './builders/RowActions.svelte';
	import Checkbox from '../Checkbox.svelte';

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
	 * The RowActions component can be used to create a menu with actions for each row.
	 * Docs: https://tanstack.com/table/latest/docs/guide/column-defs
	 */
	const columnsA: ColumnDef<Payment>[] = [
		{
			id: 'select',
			header: ({ table }) =>
				renderComponent(Checkbox, {
					checked: table.getIsAllPageRowsSelected(),
					indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
					onchange: (value) => table.toggleAllPageRowsSelected(!!value)
				}),
			cell: ({ row }) =>
				renderComponent(Checkbox, {
					checked: row.getIsSelected(),
					indeterminate: false,
					onchange: (value) => row.toggleSelected(!!value)
				})
		},
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
		},
		{
			id: 'actions',
			cell: ({ row }) =>
				renderComponent(RowActions, {
					items: [
						{
							label: 'View Details',
							icon: NotepadText,
							href: `#`
						},
						{
							label: 'Edit',
							icon: SquarePen,
							href: `#`
						},
						{
							label: 'Refund',
							icon: HandCoins,
							hidden: row.original.status !== 'Success'
						},
						{
							label: 'Delete',
							icon: Trash2,
							destructive: true,
							onclick: () =>
								confirmAction(
									async () =>
										await new Promise((resolve) =>
											setTimeout(() => {
												dataA = dataA.filter((p) => p.id !== row.original.id);
												resolve();
											}, 1000)
										),
									{
										title: `Are you sure you want to delete payment ${row.original.id}? This action cannot be undone.`
									}
								)
						}
					]
				})
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
	let dataA: Payment[] = createFakeData(50);
	let dataB: Payment[] = createFakeData(10);

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
		<div class="status">
			<CircleCheck size="16" />
			{status}
		</div>
	{:else if status === 'Processing'}
		<div class="status">
			<CircleDashed size="16" />
			{status}
		</div>
	{:else if status === 'Pending'}
		<div class="status">
			<Circle size="16" />
			{status}
		</div>
	{:else if status === 'Failed'}
		<div class="status">
			<CircleAlert size="16" />
			{status}
		</div>
	{/if}
{/snippet}

<!-- A table using all features -->
<DataTable
	columns={columnsA}
	data={dataA}
	filterColumn="email"
	pageSize={5}
	toggleColumns={['email', 'createdAt', 'amount']}
	withSelection
/>

<!-- 
A simple, static table. 
In this case it would be better to use the basic Table component instead.
-->
<DataTable columns={columnsB} data={dataB} />

<style>
	div {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: max-content;
	}
</style>
