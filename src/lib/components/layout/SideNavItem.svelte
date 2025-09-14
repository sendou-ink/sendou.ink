<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { closeMobileNavContext } from './mobile-nav-context';

	interface Props extends HTMLAnchorAttributes {
		icon: Snippet;
		children: Snippet;
		href?: ResolvedPathname;
		number?: number;
	}

	const { icon, children, href, number, ...rest }: Props = $props();

	const element = $derived(href ? 'a' : 'div');
	const closeMobileNav = $derived(closeMobileNavContext.getOr(undefined));

	function handleClick() {
		if (href && closeMobileNav) {
			closeMobileNav();
		}
	}
</script>

<svelte:element this={element} class="item" {href} onclick={handleClick} {...rest}>
	{@render icon()}
	{@render children()}
	{#if number !== undefined}
		<span>{number}</span>
	{/if}
</svelte:element>

<style>
	.item {
		color: var(--color-base-content);
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		background-color: var(--color-base-section);
		border-radius: var(--radius-field);
		padding: var(--s-1-5) var(--s-2);

		:global(svg) {
			width: 1.25rem;
			height: 1.25rem;
		}
	}

	a {
		&:hover {
			background-color: var(--color-primary-transparent);
		}

		&:focus-visible {
			outline: 2px solid var(--color-primary);
		}
	}

	span {
		margin-left: auto;
		background-color: var(--color-primary-transparent);
		color: var(--color-primary);
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		padding: var(--s-0-5) var(--s-2);
		border-radius: var(--radius-box);
	}
</style>
