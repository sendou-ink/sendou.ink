<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="sideNavFooter">
	{@render children()}
</div>

<style>
	.sideNavFooter {
		height: var(--layout-nav-height);
		display: flex;
		align-items: center;
		gap: var(--s-1);
		padding: var(--s-1-5) var(--s-3);
		background-color: var(--color-bg-nav);
		border-top: 1.5px solid var(--color-border);
		flex-shrink: 0;
	}

	.sideNavFooter :global(.sideNavFooterUser) {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		color: var(--color-text);
		text-decoration: none;
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		border-radius: var(--radius-field);
		padding: var(--s-1);
		margin-left: calc(-1 * var(--s-1));
		flex: 1;
		min-width: 0;
	}

	.sideNavFooter :global(.sideNavFooterUser:hover) {
		background-color: var(--color-bg-high);
	}

	.sideNavFooter :global(.sideNavFooterUsername) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sideNavFooter :global(.sideNavFooterActions) {
		display: flex;
		align-items: center;
		gap: var(--s-0-5);
		margin-left: auto;
	}

	.sideNavFooter :global(.sideNavFooterButton) {
		display: grid;
		place-items: center;
		background-color: transparent;
		width: var(--field-size-sm);
		height: var(--field-size-sm);
		padding: 0;
		border: none;
		border-radius: var(--radius-field);
		color: var(--color-text-high);
		cursor: pointer;
	}

	.sideNavFooter :global(.sideNavFooterButton:hover) {
		background-color: var(--color-bg-high);
		color: var(--color-text);
	}

	.sideNavFooter :global(.sideNavFooterButton:focus-visible) {
		outline: var(--focus-ring);
		outline-offset: -2px;
	}

	.sideNavFooter :global(.sideNavFooterButton svg) {
		width: 18px;
		height: 18px;
	}

	.sideNavFooter :global(.sideNavFooterNotification) {
		position: relative;
	}

	.sideNavFooter :global(.sideNavFooterUnseenDot) {
		--dot-top: 2px;
		--dot-right: 2px;
	}
</style>
