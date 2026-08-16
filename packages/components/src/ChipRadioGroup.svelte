<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
	orientation?: "horizontal" | "vertical";
	wrap?: boolean;
	class?: string;
}

let {
	children,
	orientation = "horizontal",
	wrap = false,
	class: className,
}: Props = $props();
</script>

<div
	class={["group", className]}
	data-orientation={orientation}
	data-wrap={wrap}
	role="radiogroup"
>
	{@render children()}
</div>

<style>
	.group {
		display: flex;
		gap: var(--s-1);
		width: max-content;

		&[data-orientation="vertical"] {
			flex-direction: column;
			align-items: stretch;
		}

		&[data-wrap="true"] {
			flex-wrap: wrap;
			width: auto;
		}
	}
</style>
