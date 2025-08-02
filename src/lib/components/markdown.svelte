<script lang="ts">
	interface Props {
		/** Parsed markdown content. NOTE: this needs to be sanitized. */
		content: string;
	}

	let { content }: Props = $props();
</script>

<div class="markdown-content">
	<!-- eslint-disable svelte/no-at-html-tags -->
	{@html content}
</div>

<style>
	.markdown-content {
		:global(a) {
			font-weight: var(--semi-bold);
			color: var(--theme);
		}

		:global(h1) {
			padding-block-end: var(--s-6);
		}

		:global(p) {
			padding-block: var(--s-2-5);
		}
	}
</style>
