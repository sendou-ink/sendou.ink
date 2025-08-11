<script lang="ts">
	import { Tabs } from 'bits-ui';
	import type { Component, Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		triggers: Array<{
			icon?: Component;
			label: string;
			value: string;
			number?: number;
		}>;
		value: string;
		orientation?: 'horizontal' | 'vertical';
		/** xxx: unimplemented props */
		// /** Should there be padding above the panels. Defaults to true, pass in false if the panel content is managing its own padding. */
		// padded?: boolean;
		// /** Hide tabs if only one tab shown? Defaults to true. */
		// disappearing?: boolean;
	}

	let { children, value = $bindable(), orientation, triggers }: Props = $props();
</script>

<Tabs.Root bind:value {orientation}>
	{#snippet child({ props })}
		<div {...props} class="container">
			<Tabs.List>
				{#snippet child({ props })}
					<div {...props} class="tab-list">
						{#each triggers as { label, value, icon: Icon, number } (label)}
							<Tabs.Trigger {value} class="tab-button">
								{#snippet child({ props })}
									<button {...props} class="tab-button">
										{#if Icon}
											<Icon />
										{/if}
										{label}
										{#if typeof number === 'number' && number !== 0}
											<span class="tab-number">{number}</span>
										{/if}
									</button>
								{/snippet}
							</Tabs.Trigger>
						{/each}
					</div>
				{/snippet}
			</Tabs.List>
			{@render children()}
		</div>
	{/snippet}
</Tabs.Root>

<style>
	.container[data-orientation='vertical'] {
		display: flex;
		flex-direction: row;
		min-height: 100vh;
	}

	.tab-list {
		display: flex;
		flex-direction: row;
		border-bottom: var(--border-style);
	}

	.tab-list :global(svg) {
		--icon-size: 16px;
		min-width: var(--icon-size);
		min-height: var(--icon-size);
		max-width: var(--icon-size);
		max-height: var(--icon-size);
		margin-inline-end: var(--s-1-5);
	}

	.tab-list[data-orientation='vertical'] {
		flex-direction: column;
		border-inline-end: var(--border-style);
		border-block-end: none;
	}

	.tab-button {
		background-color: transparent;
		border: none;
		font-size: var(--fonts-xs);
		border-radius: 0;
		border-bottom: 2px solid transparent;
		color: var(--text-lighter);
		white-space: nowrap;
		flex: 1;
		transform: none !important;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--s-1-5) var(--s-3);
		font-weight: var(--semi-bold);
	}

	.tab-button[data-orientation='vertical'] {
		border-bottom: none;
		border-inline-end: 2px solid transparent;
		justify-content: start;
		padding: var(--s-2-5) var(--s-3);
		flex-grow: 0;
	}

	.tab-button[data-state='active'] {
		border-color: var(--color-primary);
		color: var(--color-base-content);
	}

	.tab-button:focus-visible {
		color: var(--color-primary) !important;
		outline: none;
	}

	.tab-number {
		color: var(--color-primary);
		margin-inline-start: var(--s-2);
		font-weight: var(--bold);
	}
</style>
