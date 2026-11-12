<script lang="ts">
import type { Snippet } from "svelte";
import type { ClassValue } from "svelte/elements";

interface Props {
	children: Snippet;
	type: "error" | "info";
	class?: ClassValue;
	spaced?: boolean;
	id?: string;
}

let { children, type, class: className, spaced = true, id }: Props = $props();
</script>

<div {id} class={[type, !spaced && "no-margin", className]}>
	{@render children()}
</div>

<style>
	@layer components {
		.error {
			display: block;
			color: var(--color-error);
			font-size: var(--font-xs);
			margin-block-start: var(--label-margin);
		}

		.info {
			display: block;
			color: var(--color-text-high);
			font-size: var(--font-xs);
			margin-block-start: var(--label-margin);
		}

		.no-margin {
			margin-block-start: 0;
		}
	}
</style>
