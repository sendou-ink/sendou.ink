<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		href: ResolvedPathname;
	}

	const { children, href }: Props = $props();
</script>

<li>
	<div class="dot"></div>
	<a {href}>{@render children()}</a>
</li>

<style>
	li {
		margin: 0;
		margin-inline-start: -11.5px;
	}

	a {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xxs);
		font-weight: var(--semi-bold);
		padding-inline-start: var(--s-5);
	}

	.dot {
		height: 6px;
		width: 6px;
		background-color: var(--color-base-border);
		border-radius: 50%;
		display: inline-block;
		margin-right: var(--s-1);
	}
</style>
