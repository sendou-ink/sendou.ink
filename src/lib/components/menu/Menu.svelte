<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';

	// xxx: missing some props
	interface Props {
		children: Snippet;
		scrolling?: boolean;
		items: Array<{
			icon?: Component;
			imgSrc?: string;
			label: string;
			onclick?: VoidFunction;
			href?: string;
			disabled?: boolean;
			hidden?: boolean;
			destructive?: boolean;
			checked?: boolean;
		}>;
	}

	let { children, items, scrolling }: Props = $props();

	const visibleItems = $derived(items.filter((item) => !item.hidden));
</script>

<!-- xxx: disable if no items? -->
<DropdownMenu.Root>
	{@render children()}
	<DropdownMenu.Portal>
		<DropdownMenu.Content sideOffset={8} collisionPadding={8} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} class={['items-container', { scrolling }]}>
							{#each visibleItems as { icon: Icon, imgSrc, label, onclick, href, disabled, destructive, checked } (label)}
								{@const tag = href ? 'a' : 'div'}
								{#if checked === undefined}
									<DropdownMenu.Item onclick={!disabled ? onclick : undefined} {disabled}>
										{#snippet child({ props })}
											<svelte:element
												this={tag}
												{...props}
												{href}
												class={['item', { destructive }]}
											>
												{#if Icon}
													<span class="item-icon"><Icon /></span>
												{:else if imgSrc}
													<img class="item-icon" src={imgSrc} alt="" />
												{/if}
												{label}
											</svelte:element>
										{/snippet}
									</DropdownMenu.Item>
								{:else}
									<DropdownMenu.CheckboxItem
										onclick={!disabled ? onclick : undefined}
										closeOnSelect={false}
										{disabled}
										{checked}
									>
										{#snippet child({ props })}
											<div {...props} class="item checkbox">
												{#if checked}
													<span class="item-icon"><Check /></span>
												{/if}
												{label}
											</div>
										{/snippet}
									</DropdownMenu.CheckboxItem>
								{/if}
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

	.scrolling {
		max-height: 300px !important;
		overflow-y: auto;
	}

	.item {
		display: flex;
		align-items: center;
		font-weight: var(--bold);
		font-size: var(--fonts-xs);
		color: var(--color-base-content);
		white-space: nowrap;
		gap: var(--s-2-5);
		padding-inline: var(--s-3-5);
		background-color: var(--color-base-section);
		width: 100%;
		border: 0;
		outline: none;
		justify-content: flex-start;
		min-height: 36px;
		max-height: 36px;

		&:first-child {
			border-radius: 14.5px 14.5px var(--rounded-xs) var(--rounded-xs);
		}

		&:last-child {
			border-radius: var(--rounded-xs) var(--rounded-xs) 14.5px 14.5px;
		}

		&.destructive {
			color: var(--color-error);
		}

		&.checkbox {
			user-select: none;
			position: relative;
			padding-inline-start: calc(var(--s-3-5) + var(--s-2-5) + 24px);

			.item-icon {
				position: absolute;
				left: var(--s-3-5);
			}
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
		min-width: 24px;
		max-width: 24px;
	}

	span.item-icon {
		padding: var(--s-0-5);
	}
</style>
