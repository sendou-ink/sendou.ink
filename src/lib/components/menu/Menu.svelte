<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Component, Snippet } from 'svelte';

	// xxx: missing some props
	interface Props {
		children: Snippet;
		items: Array<{
			icon?: Component;
			imgSrc?: string;
			label: string;
			onclick?: VoidFunction;
			href?: string;
			disabled?: boolean;
			hidden?: boolean;
			destructive?: boolean;
		}>;
	}

	let { children, items }: Props = $props();

	const visibleItems = $derived(items.filter((item) => !item.hidden));
</script>

<!-- xxx: moves the whole page left on open -->

<DropdownMenu.Root>
	{@render children()}
	<DropdownMenu.Portal>
		<DropdownMenu.Content forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} class="items-container">
							{#each visibleItems as { icon: Icon, imgSrc, label, onclick, href, disabled, destructive } (label)}
								{@const tag = href ? 'a' : 'div'}
								<DropdownMenu.Item {onclick} {disabled}>
									{#snippet child({ props })}
										<svelte:element this={tag} {...props} {href} class={['item', { destructive }]}>
											{#if Icon}
												<span class="item-icon"><Icon /></span>
											{:else if imgSrc}
												<img class="item-icon" src={imgSrc} alt="" />
											{/if}
											{label}
										</svelte:element>
									{/snippet}
								</DropdownMenu.Item>
							{/each}
						</div>
					</div>
				{/if}
			{/snippet}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	.items-container {
		margin-block-start: var(--s-2-5);
		border-radius: var(--radius-box);
		background-color: var(--color-base-section);
		border: var(--border-style);
		z-index: 10;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		align-items: flex-start;
		width: max-content;

		/** animations */
		opacity: 1;
		transform: translateY(0);
		transition:
			opacity 0.2s ease-out,
			transform 0.2s ease-out;

		@starting-style {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.item {
		display: flex;
		align-items: center;
		font-weight: var(--bold);
		font-size: var(--fonts-xs);
		color: var(--color-base-content);
		white-space: nowrap;
		gap: var(--s-2);
		padding-inline: var(--s-3-5);
		background-color: var(--color-base-section);
		width: 100%;
		border: 0;
		outline: none;
		justify-content: flex-start;
		height: 36px;

		&:first-child {
			border-radius: 14.5px 14.5px var(--rounded-xs) var(--rounded-xs);
		}

		&:last-child {
			border-radius: var(--rounded-xs) var(--rounded-xs) 14.5px 14.5px;
		}

		&.destructive {
			color: var(--color-error);
		}
	}

	[data-highlighted] {
		background-color: var(--color-primary-transparent);
	}

	[data-disabled] {
		color: var(--color-base-content-secondary);
		cursor: not-allowed;
	}

	.item-icon {
		min-width: 18px;
		max-width: 18px;
	}
</style>
