<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		children: Snippet;
		class?: string;
		footer?: Snippet;
		top?: Snippet;
		topCentered?: boolean;
		collapsed?: boolean;
	}

	let {
		children,
		class: className,
		footer,
		top,
		topCentered,
		collapsed,
	}: Props = $props();
</script>

<nav
	data-testid="side-nav"
	class={["sideNav", className, { sideNavCollapsed: collapsed }]}
>
	<div class={["sideNavTop", { sideNavTopCentered: topCentered }]}>
		{#if top}{@render top()}{/if}
	</div>
	<div class="sideNavInner scrollbar">
		{@render children()}
	</div>
	{#if footer}{@render footer()}{/if}
</nav>

<style>
	.sideNav {
		background-color: var(--color-bg-nav);
		min-width: var(--layout-sidenav-width);
		max-width: var(--layout-sidenav-width);
		border-right: 1.5px solid var(--color-border);
		overflow: hidden;
		position: sticky;
		top: 0;
		left: 0;
		height: 100dvh;
		display: none;
		flex-direction: column;

		@media screen and (min-width: 1000px) {
			display: flex;
		}
	}

	.sideNavCollapsed {
		display: none;
	}

	.sideNavTop {
		height: var(--layout-nav-height);
		background-color: var(--color-bg-nav);
		border-bottom: 1.5px solid var(--color-border);
		display: flex;
		align-items: center;
		padding-inline: var(--s-2);
		flex-shrink: 0;
	}

	.sideNavTopCentered {
		justify-content: center;
	}

	.sideNavInner {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-1-5);
		padding-block-end: var(--s-2);
		overflow-x: hidden;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	@media screen and (min-width: 1475px) {
		:global(html[data-fuse="true"]) .sideNav {
			z-index: 20;
		}
	}
</style>
