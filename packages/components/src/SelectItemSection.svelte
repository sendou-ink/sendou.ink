<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		heading: string;
		headingImg?: Snippet;
		class?: string;
		children: Snippet;
	}

	let { heading, headingImg, class: className, children }: Props = $props();
</script>

<div role="group" aria-label={heading}>
	<div class={[className, "categoryHeading"]}>
		{#if headingImg}{@render headingImg()}{/if}
		{heading}
		<div class="categoryDivider"></div>
	</div>
	{@render children()}
</div>

<style>
	.categoryHeading {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-weight: var(--weight-extra);
		color: var(--color-text-high);
		text-transform: uppercase;
		font-size: var(--font-2xs);
		padding-block-start: var(--s-3);
		padding-block-end: var(--s-1);
		padding-inline: var(--s-1-5);
		white-space: nowrap;
	}

	.categoryHeading :global(img) {
		border-radius: 100%;
		background-color: var(--color-bg-higher);
		padding: var(--s-1);
		min-width: 28px;
	}

	.categoryDivider {
		background-color: var(--color-border);
		width: 100%;
		height: 2px;
		margin-block: var(--s-2);
	}
</style>
