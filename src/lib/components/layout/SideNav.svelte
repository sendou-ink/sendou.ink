<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
</script>

<!-- xxx: active symbols -->
<nav>
	{@render children()}
</nav>

<style>
	nav {
		--side-nav-width: 225px;
		background-color: var(--color-base-section);
		display: none;
		position: sticky;
		left: 0;
		top: var(--s-2-5);
		flex-direction: column;
		gap: var(--s-2);
		overflow-y: auto;
		max-height: calc(100vh - var(--layout-nav-height));
		min-width: var(--side-nav-width);
		max-width: var(--side-nav-width);
		padding: var(--s-4) var(--s-2-5);
		border: var(--border-style);
		border-radius: var(--radius-box);
		margin: var(--s-2-5);
		max-height: 93vh;

		&::-webkit-scrollbar,
		&::-webkit-scrollbar-track {
			background-color: inherit;
			height: 18px;
			width: 18px;
		}

		&::-webkit-scrollbar-thumb {
			background-color: var(--color-primary-transparent);
			border: 6px solid transparent;
			border-radius: 99999px;
			background-clip: content-box;
		}

		@media screen and (min-width: 800px) {
			display: flex;
		}
	}
</style>
