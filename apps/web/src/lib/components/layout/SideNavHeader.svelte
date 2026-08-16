<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		children: Snippet;
		icon?: Snippet;
		action?: Snippet;
	}

	let { children, icon, action }: Props = $props();
</script>

<header data-testid="side-nav-header" class="sideNavHeader">
	{#if icon}
		<div class="iconContainer">{@render icon()}</div>
	{/if}
	<h2>{@render children()}</h2>
	{#if action}
		<span class="sideNavHeaderAction">{@render action()}</span>
	{/if}
</header>

<style>
	.sideNavHeader {
		color: var(--color-text-high);
		padding: var(--s-1-5) var(--s-2);
		margin-inline: calc(-1 * var(--s-1-5));
		background-color: var(--color-bg-high);
		display: flex;
		align-items: center;
		gap: var(--s-2);
		border-color: var(--color-border);
		border-top: 1.5px solid var(--color-border);
		border-bottom: 1.5px solid var(--color-border);
		height: var(--layout-nav-height);

		&:first-child {
			margin-block-start: calc(-1 * var(--s-1-5));
			border-top: none;
		}

		& h2 {
			font-size: var(--font-xs);
			font-weight: var(--weight-bold);
		}

		& :global(svg) {
			width: 18px;
		}
	}

	.sideNavHeaderAction {
		display: flex;
		align-items: center;
		margin-inline-start: auto;
		font-size: var(--font-2xs);
		font-weight: var(--weight-normal);

		& :global(a) {
			color: var(--color-text-high);
			text-decoration: none;

			&:hover {
				color: var(--color-text);
				text-decoration: underline;
			}
		}
	}

	.iconContainer {
		background-color: var(--color-bg-high);
		border-radius: var(--radius-field);
		padding: var(--s-1-5);
	}
</style>
