<script lang="ts">
	import type { Snippet } from "svelte";
	import { getMenuContext } from "./menu-context.ts";

	interface Props {
		onAction?: () => void;
		href?: string;
		icon?: Snippet;
		isActive?: boolean;
		isDestructive?: boolean;
		isDisabled?: boolean;
		children: Snippet;
	}

	let {
		onAction,
		href,
		icon,
		isActive,
		isDestructive,
		isDisabled,
		children,
	}: Props = $props();

	const menu = getMenuContext();

	function act() {
		if (isDisabled) return;
		menu.close();
		onAction?.();
	}
</script>

{#snippet content()}
	{#if icon}
		<span class="itemIcon">{@render icon()}</span>
	{/if}
	{@render children()}
{/snippet}

{#if href}
	<a
		{href}
		class={["item", { itemActive: isActive, itemDestructive: isDestructive, itemDisabled: isDisabled }]}
		role="menuitem"
		tabindex="-1"
		aria-disabled={isDisabled || undefined}
		onclick={() => menu.close()}
	>
		{@render content()}
	</a>
{:else}
	<button
		type="button"
		class={["item", { itemActive: isActive, itemDestructive: isDestructive, itemDisabled: isDisabled }]}
		role="menuitem"
		tabindex="-1"
		aria-disabled={isDisabled || undefined}
		onclick={act}
	>
		{@render content()}
	</button>
{/if}

<style>
	.item {
		display: flex;
		align-items: center;
		font-weight: var(--weight-bold);
		font-size: var(--font-xs);
		color: var(--color-text);
		white-space: nowrap;
		gap: var(--s-2);
		border-radius: var(--radius-field);
		padding: var(--s-1-5) var(--s-3);
		background-color: var(--color-bg-high);
		width: 100%;
		border: 0;
		outline: none;
		justify-content: flex-start;
		transition: background-color 0.15s;
		cursor: pointer;

		&:hover,
		&:focus {
			background-color: var(--color-bg-higher);
		}
	}

	.itemDisabled {
		color: var(--color-text-high);
		cursor: not-allowed;
	}

	.itemActive {
		color: var(--color-text-accent);
	}

	.itemDestructive {
		color: var(--color-error);
	}

	.itemIcon {
		width: 18px;
		display: inline-flex;
	}

	.itemIcon :global(svg) {
		width: 100%;
		height: auto;
	}
</style>
