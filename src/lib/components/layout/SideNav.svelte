<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';

	interface Props {
		children: Snippet;
		isMobile?: boolean;
		isMobileSideNavOpen?: boolean;
		closeMobileNav?: () => void;
	}

	let {
		children,
		isMobile = false,
		isMobileSideNavOpen = $bindable(false),
		closeMobileNav
	}: Props = $props();

	if (isMobile && closeMobileNav) {
		// TODO: is this correct? or should the context contain just the reactive piece of state
		closeMobileNavContext.set(closeMobileNav);
	}
</script>

<!-- xxx: active symbols -->
{#if isMobile}
	<Dialog.Root bind:open={isMobileSideNavOpen}>
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
						<nav {...props} class="dialog-content">
							{@render children()}
						</nav>
					{/if}
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{:else}
	<nav>
		{@render children()}
	</nav>
{/if}

<style>
	nav {
		--side-nav-width: 225px;
		background-color: var(--color-base-section);
		position: sticky;
		left: 0;
		top: var(--s-2-5);
		flex-direction: column;
		gap: var(--s-2);
		overflow-y: auto;
		max-height: calc(100vh - var(--layout-nav-height) - var(--s-5));
		height: fit-content;
		min-width: var(--side-nav-width);
		max-width: var(--side-nav-width);
		padding: var(--s-4) var(--s-2-5);
		border: var(--border-style);
		border-radius: var(--radius-box);
		margin: var(--s-2-5);

		&::-webkit-scrollbar,
		&::-webkit-scrollbar-track {
			background-color: transparent;
			height: 18px;
			width: 18px;
		}

		&::-webkit-scrollbar-thumb {
			background-color: var(--color-primary-transparent);
			border: 6px solid transparent;
			border-radius: 99999px;
			background-clip: content-box;
		}
	}

	:not(.dialog-content) {
		display: none;

		@media screen and (min-width: 800px) {
			display: flex;
		}
	}

	/** Contains copy paste from Dialog.svelte, if we need the same in a 3rd place might be worth to create some abstraction */
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

	.dialog-content {
		overflow: hidden;
		margin: auto;
		position: fixed;
		top: 50%;
		left: 134px;
		transform: translate(-50%, -50%);
		z-index: 100;
		animation: slide-in 200ms ease-out;
	}

	@keyframes slide-in {
		from {
			transform: translate(-100%, -50%);
		}
		to {
			transform: translate(-50%, -50%);
		}
	}
</style>
