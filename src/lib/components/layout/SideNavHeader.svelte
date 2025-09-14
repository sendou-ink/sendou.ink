<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

	interface Props {
		href: ResolvedPathname;
		imgSrc: string;
		heading: string;
		subheading?: string | Snippet;
	}

	const { href, imgSrc, heading, subheading }: Props = $props();
</script>

<a {href} class="stack items-center horizontal sm">
	<img src={imgSrc} alt="" />
	<div>
		<div class="heading">{heading}</div>
		{#if subheading}
			<div class="subheading">
				{#if typeof subheading !== 'string'}
					{@render subheading()}
				{:else if subheading}
					{subheading}
				{/if}
			</div>
		{/if}
	</div>
</a>

<style>
	a {
		color: var(--color-base-content);

		@media screen and (min-width: 800px) {
			margin-block-end: var(--s-2);
		}

		.heading {
			font-weight: var(--semi-bold);
			font-size: var(--fonts-sm);
			line-height: 1.2;
			max-width: 175px;
			text-overflow: ellipsis;
			overflow: hidden;
			white-space: nowrap;
		}

		.subheading {
			font-size: var(--fonts-xxs);
			color: var(--color-base-content-secondary);
		}

		img {
			width: 2.5rem;
			height: 2.5rem;
			border-radius: 100%;
		}
	}
</style>
