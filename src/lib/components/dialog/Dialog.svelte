<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';
	import Button from '$lib/components/buttons/Button.svelte';
	import X from '@lucide/svelte/icons/x';

	type Props = {
		open?: boolean;
		trigger?: Snippet;
		children?: Snippet;
		title?: string;

		// xxx: missing props
		// showHeading?: boolean;
		// /** When closing the modal which URL to navigate to */
		// onCloseTo?: string;
		// /** If true, shows the close button even if onClose is not provided */
		// showCloseButton?: boolean;
	};

	// xxx: placeholder
	const showCloseButton = true;

	let { open = $bindable(false), children, title, trigger }: Props = $props();
</script>

<!-- xxx: scroll lock not working -->
<Dialog.Root bind:open>
	{@render trigger?.()}
	<Dialog.Portal>
		<Dialog.Overlay>
			{#snippet child({ props, open })}
				{#if open}
					<div {...props} class="overlay"></div>
				{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content>
			{#snippet child({ props, open })}
				{#if open}
					<div {...props} class="content">
						<div class="title">
							{#if title}
								<Dialog.Title>
									{#snippet child({ props })}
										<div {...props}>
											{title}
										</div>
									{/snippet}
								</Dialog.Title>
							{/if}
							<Dialog.Close>
								{#snippet child({ props })}
									{#if showCloseButton}
										<Button
											{...props}
											variant="minimal-destructive"
											class="ml-auto"
											icon={X}
											aria-label="Close dialog"
										/>
									{/if}
								{/snippet}
							</Dialog.Close>
						</div>
						{@render children?.()}
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		overflow-y: auto;
		background-color: var(--color-base-backdrop);
		display: flex;
		min-height: 100%;
		align-items: flex-start;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		padding-block: var(--s-32);
		animation: fade-in 250ms ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.content {
		width: 100%;
		max-width: 28rem;
		overflow: hidden;
		border-radius: 1rem;
		background-color: var(--color-base-card-section);
		border: var(--border-style);
		padding: var(--s-6);
		text-align: left;
		vertical-align: middle;
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		margin: auto;

		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 100;
	}

	.content[data-entering] {
		animation: zoom-in-95 300ms ease-out;
	}

	@keyframes zoom-in-95 {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.dialog {
		outline: none;
		position: relative;
	}

	.title {
		border-bottom: var(--border-style);
		padding-block-end: var(--s-2);
		margin-block-end: var(--s-4);
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-block-start: -3px;
		font-size: var(--fonts-lg);
		font-weight: var(--semi-bold);
	}

	.noHeading {
		margin-block-start: -14px;
	}

	.heading {
		font-size: var(--fonts-lg);
	}
</style>
