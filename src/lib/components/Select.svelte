<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLSelectAttributes, 'children'> {
		value?: string | number;
		items: Array<{ label: string | number; value: string | number }>;
		clearable?: boolean;
	}

	let { value: selectedValue = $bindable(), clearable, items, ...rest }: Props = $props();
</script>

<select {...rest}>
	{#if clearable}
		<option value="">–</option>
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

		/* xxx: this color is different than select icon color */
		background-image: url('data:image/svg+xml;utf8,<svg width="17px" color="rgb(255 255 255 / 55%)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" /></svg>');
		background-position: center right var(--s-3);
		background-repeat: no-repeat;
		cursor: pointer;
		font-weight: 500;
		padding-block: 5px; /** check correct value here */
		padding-inline: var(--s-3) var(--s-9);
	}

	select:disabled {
		cursor: not-allowed;
		opacity: 0.5;
		transform: initial;
	}

	/* Temporary solution for issue: https://github.com/sendou-ink/sendou.ink/issues/1141 */
	:global(html.light) select {
		/* TODO: Get color from CSS var */
		background-image: url('data:image/svg+xml;utf8,<svg width="1rem" color="rgb(0 0 0 / 55%)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>');
	}

	select::selection {
		overflow: hidden;
		font-weight: bold;
	}

	select:focus {
		outline: 2px solid var(--theme);
	}
</style>
