<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
</script>

<div class="my-table__container">
	<table class="my-table">{@render children()}</table>
</div>

<style>
	div {
		position: relative;
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: var(--fonts-xs);
		text-align: left;
		border-color: var(--color-base-border);

		:global {
			thead {
				font-size: var(--fonts-xxs);

				th {
					padding: var(--s-2);
				}
			}

			tbody {
				td {
					padding: var(--s-2) var(--s-2-5);
				}

				tr:hover {
					background-color: var(--color-base-section);
				}
			}

			td {
				border-bottom: 1px solid var(--color-base-border);
			}

			tr:first-child td {
				border-top: 1px solid var(--color-base-border);
			}
		}
	}
</style>
