<script lang="ts" generics="TData">
	import type { ComponentProps } from 'svelte';
	import type { Table } from '@tanstack/table-core';
	import { m } from '$lib/paraglide/messages';
	import Settings from '@lucide/svelte/icons/settings-2';
	import Menu from '$lib/components/menu/Menu.svelte';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';

	type Props<TData> = ComponentProps<typeof MenuTriggerButton> & {
		table: Table<TData>;
		toggleColumns: (keyof TData & string)[] | undefined;
	};

	let {
		table,
		toggleColumns,
		variant = 'outlined',
		icon = Settings,
		...rest
	}: Props<TData> = $props();
</script>

{#if toggleColumns}
	<div>
		<Menu
			items={table
				.getAllColumns()
				.filter(
					(column) =>
						column.getCanHide() && toggleColumns.includes(column.id as keyof TData & string)
				)
				.map((column) => ({
					label: column.id,
					onclick: () => column.toggleVisibility(),
					checked: column.getIsVisible()
				}))}
		>
			<MenuTriggerButton {variant} {icon} {...rest}>
				{m.common_actions_view()}
			</MenuTriggerButton>
		</Menu>
	</div>
{/if}

<style>
	div {
		display: contents;
	}

	div :global {
		.item {
			position: relative;
		}

		.item-icon {
			position: absolute;
			left: var(--s-2);
		}
	}
</style>
