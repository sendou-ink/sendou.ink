<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLSelectAttributes, 'children'> {
		value?: string | number | null;
		items: Array<{ label: string | number; value: string | number }>;
		clearable?: boolean;
		placeholder?: string;
	}

	let {
		value: selectedValue = $bindable(),
		clearable,
		items,
		placeholder,
		...rest
	}: Props = $props();
</script>

<select {...rest} bind:value={selectedValue}>
	{#if clearable}
		<option value="" selected={!selectedValue}>{placeholder ?? '–'}</option>
	{/if}
	{#each items as { label, value } (value)}
		<option {value} selected={value === selectedValue}>{label}</option>
	{/each}
</select>

<style>
	select {
		all: unset;
		width: 100%;
		box-sizing: border-box;
		border: var(--border-style);
		border-radius: var(--radius-field);
		background: var(--color-base-card-section);
		min-width: var(--select-width, var(--field-width-medium));
		max-width: var(--select-width, var(--field-width-medium));
		height: 37px;

		background-image: url('data:image/svg+xml;utf8,<svg width="17px" color="rgb(82, 85, 91)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>');
		background-position: center right var(--s-3);
		background-repeat: no-repeat;
		cursor: pointer;
		font-weight: 500;
		padding-block: var(--s-1);
		padding-inline: var(--s-3) var(--s-9);

		&:focus {
			border-color: transparent;
			outline: 2px solid var(--color-primary);
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.5;
			transform: initial;
		}

		&::selection {
			overflow: hidden;
			font-weight: bold;
		}
	}

	:global(html.dark) select {
		background-image: url('data:image/svg+xml;utf8,<svg width="17px" color="rgb(172, 171, 210)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" /></svg>');
	}

	@media (prefers-color-scheme: dark) {
		:global(html.auto) select {
			background-image: url('data:image/svg+xml;utf8,<svg width="17px" color="rgb(172, 171, 210)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" /></svg>');
		}
	}
</style>
