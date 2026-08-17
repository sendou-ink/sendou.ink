<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children?: Snippet;
	class?: string;
}

let { children, class: className }: Props = $props();
</script>

<div class={["root", className]}>{@render children?.()}</div>

<style>
	.root {
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
	}
</style>
