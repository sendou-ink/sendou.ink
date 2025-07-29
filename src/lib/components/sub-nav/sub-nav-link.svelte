<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	interface Props extends HTMLAnchorAttributes {
		end?: boolean;
		children: Snippet;
		secondary?: boolean;
		controlled?: boolean;
		active?: boolean;
	}

	let {
		children,
		class: className,
		end = true,
		secondary = false,
		controlled = false,
		active = false,
		...rest
	}: Props = $props();

	const isActive = $derived(() => {
		if (controlled) return active;

		const currentPath = page.url.pathname;
		if (end) {
			return currentPath === rest.href;
		} else {
			return rest.href && currentPath.startsWith(rest.href);
		}
	});
</script>

<a
	class={[
		'container',
		{
			active: isActive
		}
	]}
	{...rest}
>
	<div
		class={[
			'link',
			className,
			{
				link__secondary: secondary
			}
		]}
	>
		{@render children?.()}
	</div>
	<div
		class={[
			'border-guy',
			{
				'border-guy__secondary': secondary
			}
		]}
	></div>
</a>

<style>
	.container {
		display: flex;
		max-width: 110px;
		flex: 1;
		flex-direction: column;
		align-items: center;
		color: var(--text);
		gap: var(--s-1-5);
	}

	.sub-nav__link__container.active {
		color: var(--theme-secondary);
	}

	.link {
		width: 100%;
		padding: var(--s-1) var(--s-4);
		border-radius: var(--rounded);
		background-color: var(--bg-lightest);
		cursor: pointer;
		font-size: var(--fonts-xs);
		text-align: center;
		white-space: nowrap;
	}

	.sub-nav__link__secondary {
		font-size: var(--fonts-xxs);
		padding: var(--s-0-5) var(--s-2);
		background-color: var(--bg-lighter-solid);
	}

	.sub-nav__container.compact .sub-nav__link {
		padding: var(--s-1) var(--s-2);
	}

	.border-guy {
		width: 78%;
		height: 3px;
		border-radius: var(--rounded);
		background-color: var(--bg-lightest);
		visibility: hidden;
	}

	.border-guy__secondary {
		height: 2.5px;
		background-color: var(--bg-lighter-solid);
	}

	.link__container.active > .border-guy {
		visibility: initial;
	}
</style>
