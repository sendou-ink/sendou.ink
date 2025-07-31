<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	interface Props extends HTMLAnchorAttributes {
		end?: boolean;
		children: Snippet;
		secondary?: boolean;
	}

	let { children, class: className, end = true, secondary = false, ...rest }: Props = $props();

	const isActive = $derived.by(() => {
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
		flex: 0 0 110px;
		flex-direction: column;
		align-items: center;
		color: var(--text);
		gap: var(--s-1-5);
		font-weight: var(--semi-bold);

		&.active {
			color: var(--theme-secondary);

			.border-guy {
				visibility: initial;
			}
		}
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

	.link__secondary {
		font-size: var(--fonts-xxs);
		padding: var(--s-0-5) var(--s-2);
		background-color: var(--bg-lighter-solid);
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
</style>
