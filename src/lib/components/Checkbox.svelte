<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Checkbox } from 'bits-ui';
	import Label from './form/Label.svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import Check from '@lucide/svelte/icons/check';

	interface Props {
		checked?: boolean;
		indeterminate?: boolean;
		onchange?: (checked: boolean) => void;
		children?: Snippet;
	}

	let {
		checked = $bindable(false),
		indeterminate = $bindable(true),
		onchange,
		children
	}: Props = $props();

	const id = $props.id();
</script>

<div class="stack horizontal sm items-center">
	<Checkbox.Root
		{id}
		bind:checked
		bind:indeterminate
		onCheckedChange={(checked) => onchange?.(checked)}
	>
		{#snippet child({ checked, indeterminate, props })}
			<button {...props} class={[{ checked }]}>
				{#if indeterminate}
					<Minus size="1rem" class="icon" />
				{:else if checked}
					<Check size="1rem" class="icon" />
				{/if}
			</button>
		{/snippet}
	</Checkbox.Root>
	<Label for={id}>
		{@render children?.()}
	</Label>
</div>

<style>
	button {
		display: flex;
		align-items: center;
		padding: 0;
		height: var(--s-4);
		width: var(--s-4);
		background-color: var(--color-primary-transparent);
		border: none;
		border-radius: 4px;
		color: var(--color-primary-content);
		transition: background-color 0.1s;

		&.checked {
			background-color: var(--color-primary);
		}
	}
</style>
