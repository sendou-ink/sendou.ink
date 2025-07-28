<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
		smallText?: boolean;
	}

	let { children, class: className, smallText }: Props = $props();
</script>

<div class={['divider', className, { smallText }]}>
	{@render children?.()}
</div>

<style>
	.divider {
		display: flex;
		width: 100%;
		align-items: center;
		color: var(--theme);
		font-size: var(--fonts-lg);
		text-align: center;
	}

	.divider::before,
	.divider::after {
		flex: 1;
		border-bottom: 2px solid var(--theme-transparent);
		content: '';
	}

	.divider:not(:empty)::before {
		margin-right: 0.25em;
	}

	.divider:not(:empty)::after {
		margin-left: 0.25em;
	}

	.smallText {
		font-size: var(--fonts-sm);
	}
</style>
