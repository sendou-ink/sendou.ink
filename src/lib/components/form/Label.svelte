<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		for: string;
	}

	let { children, for: htmlFor }: Props = $props();
</script>

<label for={htmlFor}>
	{@render children()}
</label>

<style>
	label {
		display: block;
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
	}
</style>
