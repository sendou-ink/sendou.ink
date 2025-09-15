<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { closeMobileNavContext } from './mobile-nav-context';

	interface Props {
		children: Snippet;
		href: ResolvedPathname;
	}

	const { children, href }: Props = $props();
	const closeMobileNav = $derived(closeMobileNavContext.getOr(undefined));
	const isActive = $derived(page.url.pathname === href);

	function handleClick() {
		closeMobileNav?.();
	}
</script>

<li>
	<div class={['dot', { active: isActive }]}></div>
	<a {href} onclick={handleClick} class={{ active: isActive }}>{@render children()}</a>
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

		&.active {
			color: var(--color-base-content);
			font-weight: var(--bold);
		}
	}

	.dot {
		height: 6px;
		width: 6px;
		background-color: var(--color-base-border);
		border-radius: 50%;
		display: inline-block;
		margin-right: var(--s-1);

		&.active {
			background-color: var(--color-secondary);
		}
	}
</style>
