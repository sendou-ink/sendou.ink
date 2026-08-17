<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children?: Snippet;
	class?: string;
	smallText?: boolean;
}

let { children, class: className, smallText }: Props = $props();
</script>

<div class={["divider", className, { smallText }]}>{@render children?.()}</div>

<style>
	.divider {
		display: flex;
		width: 100%;
		align-items: center;
		color: var(--color-text-accent);
		font-size: var(--font-lg);
		text-align: center;

		&::before,
		&::after {
			flex: 1;
			min-width: 1rem;
			border-bottom: 2px solid var(--color-bg-high);
			content: "";
		}

		&:not(:empty)::before {
			margin-right: 0.25em;
		}

		&:not(:empty)::after {
			margin-left: 0.25em;
		}
	}

	.smallText {
		font-size: var(--font-sm);
	}
</style>
