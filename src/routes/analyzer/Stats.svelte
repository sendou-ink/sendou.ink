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
		<div>
			{#if titleContent?.image}
				<img src={titleContent?.image} alt={titleContent?.text} />
			{/if}
			{#if titleContent?.text}
				<span>{titleContent?.text}</span>
			{/if}
		</div>
	</summary>
	<div>
		{@render children()}
	</div>
	{#if bottomText}
		<p>{bottomText}</p>
	{/if}
</details>
