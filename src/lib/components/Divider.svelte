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
		color: var(--divider-text-color, var(--color-primary));
		text-align: center;
		font-size: var(--divider-font-size, var(--fonts-sm));
		text-transform: uppercase;
		font-weight: var(--semi-bold);

		&::before,
		&::after {
			flex: 1;
			border-bottom: 2px solid var(--divider-line-color, var(--color-primary-transparent));
			content: '';
		}

		&:not(:empty)::before {
			margin-right: 0.25em;
		}

		&:not(:empty)::after {
			margin-left: 0.25em;
		}
	}

	.smallText {
		font-size: var(--fonts-sm);
	}
</style>
