<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

	interface Props {
		result: 'win' | 'loss';
		children: Snippet;
		href: ResolvedPathname;
	}

	const { result, children, href }: Props = $props();
</script>

<a
	{href}
	class={{
		win: result === 'win',
		loss: result === 'loss'
	}}
>
	{@render children()}
</a>

<style>
	a {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		border: 3px solid var(--color-primary);
		border-radius: var(--radius-field);
		color: var(--text);
	}

	.win {
		border-color: var(--color-success);
	}

	.loss {
		border-color: var(--color-error);
	}
</style>
