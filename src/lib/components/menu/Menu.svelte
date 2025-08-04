<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Component, Snippet } from 'svelte';

	// xxx: missing some props
	interface Props {
		children: Snippet;
		items: Array<{
			icon?: Component;
			label: string;
			onclick?: VoidFunction;
			disabled?: boolean;
		}>;
	}

	let { children, items }: Props = $props();
</script>

<DropdownMenu.Root>
	{@render children()}
	<DropdownMenu.Portal>
		<DropdownMenu.Content class="items-container">
			{#each items as { icon: Icon, label, onclick, disabled } (label)}
				<DropdownMenu.Item class="item" {onclick} {disabled}>
					{#if Icon}
						<span class="item-icon"><Icon /></span>
					{/if}
					{label}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	:global {
		[data-dropdown-menu-content] {
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

		/* .items-container-opens-left {
			right: 0;
		}

		.container {
			position: relative;
		}

		.scrolling {
			max-height: 300px !important;
			overflow-y: auto;
			scrollbar-color: rgb(83 65 91) transparent;
			scrollbar-width: thin;
			scrollbar-gutter: stable;
		} */

		[data-dropdown-menu-item] {
			display: flex;
			align-items: center;
			font-weight: var(--bold);
			font-size: var(--fonts-xs);
			color: var(--color-base-content);
			white-space: nowrap;
			gap: var(--s-2);
			padding: var(--s-1) var(--s-2-5);
			background-color: var(--color-base-section);
			width: 100%;
			border: 0;
			outline: none;
			justify-content: flex-start;

			&:first-child {
				border-radius: 14.5px 14.5px var(--rounded-xs) var(--rounded-xs);
			}

			&:last-child {
				border-radius: var(--rounded-xs) var(--rounded-xs) 14.5px 14.5px;
			}
		}

		[data-highlighted] {
			background-color: var(--color-primary-transparent);
		}

		[data-disabled] {
			color: var(--color-base-content-secondary);
			cursor: not-allowed;
		}

		/* 

		.item-selected {
			background-color: var(--color-primary-transparent);
			font-weight: var(--extra-bold);
		}

		.item-active {
			color: var(--color-primary);
		}

		.item-img {
			min-width: 24px;
			min-height: 24px;
		} */
	}

	.item-icon {
		width: 18px;
	}
</style>
