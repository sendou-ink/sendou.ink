<script lang="ts">
import type { Snippet } from "svelte";
import Button from "./Button.svelte";

interface Props {
	/** When given, the dialog manages its own open state and renders the trigger. */
	trigger?: Snippet<[{ onclick: () => void }]>;
	heading?: string;
	showHeading?: boolean;
	/** Called when the dialog closes (Escape, backdrop, close button). Without a `trigger` the parent owns visibility and should unrender on this. */
	onClose?: () => void;
	/** Closing by clicking outside the dialog. */
	isDismissable?: boolean;
	/** If true, shows the close button even if onClose is not provided */
	showCloseButton?: boolean;
	class?: string;
	"aria-label"?: string;
	children: Snippet;
}

let {
	trigger,
	heading,
	showHeading = true,
	onClose,
	isDismissable = false,
	showCloseButton = false,
	class: className,
	"aria-label": ariaLabel,
	children,
}: Props = $props();

let triggerOpen = $state(false);

const hasTrigger = $derived(trigger !== undefined);
const isShown = $derived(!hasTrigger || triggerOpen);

function showModal(dialog: HTMLDialogElement) {
	dialog.showModal();
}

function close() {
	if (hasTrigger) {
		triggerOpen = false;
	}
	onClose?.();
}

function handleClose() {
	// fires for Escape/backdrop closes; syncs state & notifies the parent
	if (hasTrigger) {
		triggerOpen = false;
	}
	onClose?.();
}

const showsCloseButton = $derived(showCloseButton || onClose !== undefined);
</script>

{#if trigger}
	{@render trigger({
		onclick: () => {
			triggerOpen = true;
		},
	})}
{/if}

{#if isShown}
	<dialog
		class={["modal scrollbar", className]}
		aria-label={ariaLabel}
		closedby={isDismissable ? "any" : "closerequest"}
		onclose={handleClose}
		{@attach showModal}
	>
		{#if showHeading}
			<div class={["headingContainer", { noHeading: !heading }]}>
				{#if heading}
					<h2 class="heading">{heading}</h2>
				{/if}
				{#if showsCloseButton}
					<Button
						shape="circle"
						variant="minimal-destructive"
						class="ml-auto"
						onclick={close}
					>
						{#snippet icon()}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M18 6 6 18" />
								<path d="m6 6 12 12" />
							</svg>
						{/snippet}
					</Button>
				{/if}
			</div>
		{/if}
		{@render children()}
	</dialog>
{/if}

<style>
	.modal {
		width: calc(100% - 2rem);
		max-width: 28rem;
		max-height: min(80dvh, calc(var(--visual-viewport-height, 100dvh) - 10rem));
		overflow-x: hidden;
		overflow-y: auto;
		border-radius: 1rem;
		border: 1px solid var(--color-border);
		background-color: var(--color-bg);
		color: var(--color-text);
		padding: var(--s-6);
		text-align: left;
		vertical-align: middle;
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		margin: auto;
		margin-block-start: 1rem;
		animation: zoom-in-95 300ms ease-out;

		&::backdrop {
			background-color: rgba(0, 0, 0, 0.25);
			backdrop-filter: blur(10px);
			animation: fade-in 300ms ease-out;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
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

	.headingContainer {
		border-bottom: var(--border-style);
		padding-block-end: var(--s-2);
		margin-block-end: var(--s-4);
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-block-start: -3px;

		&.noHeading {
			margin-block-start: -14px;
		}
	}

	.heading {
		font-size: var(--font-lg);
		margin: 0;
	}
</style>
