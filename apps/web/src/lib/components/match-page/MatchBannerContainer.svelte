<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
}

let { children }: Props = $props();
</script>

<div class="root">{@render children()}</div>

<style>
	.root {
		--banner-height: 175px;

		display: flex;
		flex-direction: column;
		gap: var(--s-1-5);
		container-type: inline-size;
	}
</style>
