<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
	subtitle: string;
	topRight?: Snippet;
}

let { children, subtitle, topRight }: Props = $props();
</script>

<div class="root">
	<div>
		<h2 class="title">{@render children()}</h2>
		<div class="subtitle">{subtitle}</div>
	</div>
	{#if topRight}<div>{@render topRight()}</div>{/if}
</div>

<style>
	.root {
		display: flex;
		justify-content: space-between;
	}

	.title {
		font-size: var(--font-lg);
	}

	.subtitle {
		font-weight: var(--weight-bold);
		font-size: var(--font-xs);
		color: var(--color-text-high);
	}
</style>
