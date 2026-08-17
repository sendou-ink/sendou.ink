<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	type: "error" | "info";
	class?: string;
	spaced?: boolean;
	id?: string;
	children: Snippet;
}

let { type, class: className, spaced = true, id, children }: Props = $props();
</script>

<div
	{id}
	class={[
		{ info: type === "info", error: type === "error", noMargin: !spaced },
		className,
	]}
>
	{@render children()}
</div>

<style>
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

	.noMargin {
		margin-block-start: 0;
	}
</style>
