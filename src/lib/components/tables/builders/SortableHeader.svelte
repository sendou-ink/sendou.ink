<script lang="ts">
	import type { SortDirection } from '@tanstack/table-core';
	import type { ComponentProps } from 'svelte';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Button from '$lib/components/buttons/Button.svelte';

	type Props = ComponentProps<typeof Button> & {
		label: string;
		direction: SortDirection | false;
	};

	let { label, direction, variant = 'minimal', size = 'miniscule', ...rest }: Props = $props();
</script>

<Button {variant} {size} {...rest}>
	<span class="content">
		{label}
		{#if direction === 'asc'}
			<ArrowUp size="16" />
		{:else if direction === 'desc'}
			<ArrowDown size="16" />
		{:else}
			<ChevronsUpDown size="16" />
		{/if}
	</span>
</Button>

<style>
	.content {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		min-width: max-content;
		line-height: normal;
	}
</style>
