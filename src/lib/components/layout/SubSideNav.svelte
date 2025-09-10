<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
</script>

<ul>
	{@render children()}
</ul>

<style>
	ul {
		list-style: none;
		border-inline-start: var(--border-style);
		padding-inline-start: var(--s-2);
		margin-inline-start: 17px;
	}
</style>
