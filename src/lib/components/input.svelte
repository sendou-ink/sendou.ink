<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		name?: string;
		id?: string;
		class?: string;
		minlength?: number;
		maxlength?: number;
		required?: boolean;
		defaultValue?: string;
		leftAddon?: string;
		icon?: Snippet;
		type?: 'number' | 'date';
		min?: number;
		max?: number | string;
		pattern?: string;
		list?: string;
		testId?: string;
		'aria-label'?: string;
		value?: string;
		placeholder?: string;
		disableAutoComplete?: boolean;
		readonly?: boolean;
	}

	let {
		class: className,
		leftAddon,
		icon,
		testId,
		'aria-label': ariaLabel,
		value = $bindable(),
		disableAutoComplete = false,
		readonly,
		...rest
	}: Props = $props();
</script>

<div
	class={[
		'container',
		className,
		{
			'read-only': readonly
		}
	]}
>
	{#if leftAddon}
		<div class="input-addon">{leftAddon}</div>
	{/if}
	<input
		data-testid={testId}
		bind:value
		aria-label={ariaLabel}
		autocomplete={disableAutoComplete ? 'one-time-code' : undefined}
		{readonly}
		{...rest}
	/>
	{@render icon?.()}
</div>

<style>
	.container {
		display: flex;
		border: 2px solid var(--border);
		border-radius: var(--rounded-sm);
		accent-color: var(--theme-secondary);
		background-color: var(--bg-input);
		color: var(--text);
		font-size: var(--fonts-sm);
		outline: none;

		&:focus-within {
			border-color: transparent;
			outline: 2px solid var(--theme);
		}

		> input:focus-within {
			outline: none;
		}
	}

	input {
		width: 100%;
		margin: auto 0;
		height: 1rem;
		padding: var(--s-4) var(--s-3);
		border-color: transparent;
		accent-color: var(--theme-secondary);
		background-color: var(--bg-input);
		color: var(--text);
		outline: none;
	}

	.addon {
		display: grid;
		border-radius: var(--rounded-xs) 0 0 var(--rounded-xs);
		background-color: var(--bg-lighter);
		color: var(--text-lighter);
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		padding-inline: var(--s-2);
		place-items: center;
		white-space: nowrap;
	}

	.read-only {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
