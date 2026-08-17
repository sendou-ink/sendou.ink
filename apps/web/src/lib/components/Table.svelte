<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
	noRowHover?: boolean;
}

let { children, noRowHover }: Props = $props();
</script>

<div class="container">
	<table class={["table", { noRowHover }]}>
		{@render children()}
	</table>
</div>

<style>
	.container {
		position: relative;
		width: 100%;
		overflow: auto;
	}

	.table {
		width: max-content;
		min-width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: var(--font-xs);
		text-align: left;
		border-color: var(--color-border);

		& > :global(thead) {
			font-size: var(--font-2xs);
		}

		&:not(.noRowHover) :global(tbody tr:hover) {
			background-color: var(--color-bg-high);
		}

		& > :global(thead > tr > th) {
			padding: var(--s-2);
		}

		& > :global(tbody > tr > td) {
			padding: var(--s-2) var(--s-3);
		}

		& :global(tr:first-child td) {
			border-top: 1px solid var(--color-border);
		}

		& :global(td) {
			border-bottom: 1px solid var(--color-border);
		}
	}
</style>
