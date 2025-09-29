<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Search from '@lucide/svelte/icons/search';

	interface Props extends HTMLInputAttributes {
		class?: string;
		leftAddon?: string;
		icon?: Component;
		testId?: string;
		value?: string;
	}

	let {
		class: className,
		leftAddon,
		icon: Icon,
		testId,
		value = $bindable(),
		...rest
	}: Props = $props();
</script>

<div class={['container', className]}>
	{#if leftAddon}
		<div class="addon">{leftAddon}</div>
	{/if}
	<input bind:value data-testid={testId} {...rest} />
	{#if rest.type === 'search' && !Icon}
		<Search />
	{:else if Icon}
		<Icon />
	{/if}
</div>

<style>
	.container {
		display: flex;
		border: var(--border-style);
		border-radius: var(--radius-field);
		accent-color: var(--color-secondary);
		background-color: var(--color-base-card-section);
		color: var(--color-base-content);
		font-size: var(--fonts-sm);
		outline: none;
		font-weight: var(--body);
		width: var(--input-width, var(--field-width-medium));

		&:focus-within {
			border-color: transparent;
			outline: 2px solid var(--color-primary);
		}

		> input:focus-within {
			outline: none;
		}

		:global(.lucide-icon:last-child) {
			margin: auto;
			margin-right: 15px;
			min-width: 18px;
			color: var(--color-base-content-secondary);
		}
	}

	input {
		width: 100%;
		margin: auto 0;
		height: 34px;
		padding: var(--s-3-5) var(--s-3);
		border-color: transparent;
		accent-color: var(--color-secondary);
		background-color: var(--color-base-card-section);
		color: var(--text);
		outline: none;
		border-radius: var(--radius-field);

		&[readonly],
		&[disabled] {
			cursor: not-allowed;
			opacity: 0.5;
		}

		&::-webkit-input-placeholder,
		&::placeholder {
			color: var(--color-base-content-secondary);
			font-size: var(--fonts-xs);
			font-weight: var(--bold);
			letter-spacing: 0.5px;
		}
	}

	.addon {
		--addon-radius: calc(var(--radius-field) - 1.5px);
		display: grid;
		border-radius: var(--addon-radius) 0 0 var(--addon-radius);
		background-color: var(--color-base-card);
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		padding-inline: var(--s-2);
		place-items: center;
		white-space: nowrap;
	}
</style>
