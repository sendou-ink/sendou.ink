<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="info-message">
	{@render children()}
</div>

<style>
	.info-message {
		display: block;
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		margin-block-start: var(--s-1-5);
		text-wrap: balance;
	}
</style>
