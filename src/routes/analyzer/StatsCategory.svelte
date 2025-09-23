<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		bottomText?: string;
		titleContent?: {
			text: string;
			image?: string;
		};
		children: Snippet;
	}

	let { title, titleContent, bottomText, children }: Props = $props();
</script>

<details>
	<summary>
		<span>{title}</span>
		{#if titleContent}
			<div class="title-content">
				{#if titleContent?.image}
					<img src={titleContent?.image} alt={titleContent?.text} width="20" height="20" />
				{/if}
				{#if titleContent?.text}
					<span>{titleContent?.text}</span>
				{/if}
			</div>
		{/if}
	</summary>
	<div class="content">
		{@render children()}
	</div>
	{#if bottomText}
		<p>{bottomText}</p>
	{/if}
</details>

<style>
	details :global {
		&:not(:has(.card)) {
			display: none;
		}
	}

	summary {
		border-radius: var(--radius-box);
		background-color: var(--color-base-card-section);
		font-size: var(--fonts-md);
		font-weight: var(--bold);
		padding: var(--s-2) var(--s-3);
		position: relative;

		:global {
			&:has(+ div > .highlighted) {
				background-color: var(--color-base-card);
			}
		}
	}

	.title-content {
		display: inline-flex;
		font-size: var(--fonts-xs);
		gap: var(--s-2);
		align-items: center;
		background-color: var(--color-base-bg);
		border-radius: 99999px;
		padding: var(--s-1) var(--s-3);
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--color-base-content-secondary);
	}

	.content {
		display: grid;
		gap: var(--s-2);
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		margin-block: var(--s-2) var(--s-4);
	}
</style>
