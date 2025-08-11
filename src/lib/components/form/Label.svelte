<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';

	interface Props extends HTMLLabelAttributes {
		children: Snippet;
	}

	let { children, ...rest }: Props = $props();
</script>

<label {...rest}>
	{@render children()}
</label>

<style>
	label {
		display: block;
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
	}
</style>
