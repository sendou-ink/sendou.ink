<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		trigger: Snippet;
		fullWidth?: boolean;
	}

	let { children, trigger, fullWidth }: Props = $props();
</script>

<Popover.Root>
	{@render trigger()}
	<Popover.Portal>
		<Popover.Content sideOffset={8} collisionPadding={8}>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} class={['popover-content', { 'full-width': fullWidth }]}>
							{@render children()}
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	.popover-content {
		width: max-content;
		max-width: 20rem;
		padding: var(--s-2);
		border: var(--border-style);
		border-radius: var(--radius-box);
		background-color: var(--color-base-section);
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		white-space: pre-wrap;
		color: var(--color-base-content);

		opacity: 1;
		transform: translateY(0);
		transition:
			opacity 0.2s ease-out,
			transform 0.2s ease-out;

		@starting-style {
			opacity: 0;
			transform: translateY(-4px);
		}

		&.full-width {
			max-width: unset;
		}
	}
</style>
