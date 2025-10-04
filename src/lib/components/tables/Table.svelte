<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
</script>

<div class="scrollbar">
	<table>{@render children()}</table>
</div>

<style>
	div {
		position: relative;
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		font-size: var(--fonts-xs);
		text-align: left;
		text-indent: 0;
		border-color: var(--color-base-border);
		border-collapse: collapse;
		border-spacing: 0;

		:global {
			thead {
				font-size: var(--fonts-xxs);

				th {
					padding: var(--s-2);
					white-space: nowrap;
					vertical-align: middle;
				}
			}

			tbody {
				td {
					padding: var(--s-2);
					vertical-align: middle;
					border-bottom: 1px solid var(--color-base-border);
				}

				tr:hover {
					background-color: var(--color-base-section);
				}

				tr:first-child td {
					border-top: 1px solid var(--color-base-border);
				}
			}
		}
	}
</style>
