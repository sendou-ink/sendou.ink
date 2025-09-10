<!-- xxx: deprecate in favor of the SideNav component? -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		secondary?: boolean;
	}

	let { children, secondary = false }: Props = $props();
</script>

<div>
	<nav
		class={[
			'container',
			{
				secondary
			}
		]}
	>
		{@render children()}
	</nav>
</div>

<style>
	.container {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-4);
		margin-block-end: var(--s-8);
	}

	.secondary {
		margin-block-end: var(--s-2);
	}
</style>
