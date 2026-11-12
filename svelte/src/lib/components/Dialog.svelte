<script lang="ts">
import { X } from "@lucide/svelte";
import type { Snippet } from "svelte";
import type { Attachment } from "svelte/attachments";
import type { ClassValue } from "svelte/elements";
import { goto } from "$app/navigation";
import { lockScroll } from "~/modules/scroll-lock/scroll-lock";
import Button from "./Button.svelte";

interface Props {
	children?: Snippet;
	heading?: string;
	onClose?: () => void;
	/** URL to navigate to on close */
	onCloseTo?: string;
	/** Closing by clicking outside the dialog. */
	isDismissable?: boolean;
	class?: ClassValue;
	"aria-label"?: string;
}

let {
	children,
	heading,
	onClose,
	onCloseTo,
	isDismissable,
	class: className,
	"aria-label": ariaLabel,
}: Props = $props();

const dialogId = $props.id();
const headingId = `${dialogId}-heading`;

let pressStartedOnBackdrop = false;
let isUnmounting = false;

// like the React dialog, nothing is rendered on the server: a modal can only be shown by script
let isMounted = $state(false);
$effect(() => {
	isMounted = true;
});

/**
 * Shows the dialog modally as it mounts; the caller owns visibility by rendering it or not.
 * Focus lands on the dialog itself rather than its first control.
 */
const modal: Attachment<HTMLDialogElement> = (dialog) => {
	dialog.showModal();
	dialog.focus();
	const releaseScroll = lockScroll();

	return () => {
		isUnmounting = true;
		releaseScroll();
		if (dialog.open) dialog.close();
	};
};

// Opening natively focuses the first control (Chromium ignores `autofocus` on the dialog itself),
// and then moving focus to the dialog blurs it, which e.g. shows a required field's error at once
const initialFocusSink: Attachment<HTMLSpanElement> = (sink) => {
	sink.setAttribute("autofocus", "");
};

function handleClosed() {
	if (isUnmounting) return;

	if (onCloseTo) {
		void goto(onCloseTo);
	} else {
		onClose?.();
	}
}

function isOnBackdrop(event: MouseEvent & { currentTarget: HTMLDialogElement }) {
	if (event.target !== event.currentTarget) return false;
	const rect = event.currentTarget.getBoundingClientRect();

	return (
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom
	);
}
</script>

{#if isMounted}
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Escape closes the dialog natively) -->
<dialog
	{@attach modal}
	id={dialogId}
	class={[className, "modal"]}
	aria-label={ariaLabel}
	aria-labelledby={!ariaLabel && heading ? headingId : undefined}
	tabindex="-1"
	closedby="closerequest"
	onclose={handleClosed}
	onpointerdown={(event) => {
		pressStartedOnBackdrop = Boolean(isDismissable) && isOnBackdrop(event);
	}}
	onclick={(event) => {
		// native `closedby` closes on pointer up, letting the click land on what is underneath the backdrop
		if (pressStartedOnBackdrop && isOnBackdrop(event)) {
			event.currentTarget.close();
		}
	}}
>
	<span {@attach initialFocusSink} tabindex="-1" class="initial-focus-sink"
	></span>
	{#if heading || onClose || onCloseTo}
		<div class={["heading-container", !heading && "no-heading"]}>
			{#if heading}
				<h2 id={headingId} class="heading">{heading}</h2>
			{/if}
			{#if onClose || onCloseTo}
				<Button
					shape="circle"
					variant="minimal-destructive"
					class="ml-auto"
					aria-label="Close"
					commandfor={dialogId}
					command="close"
				>
					{#snippet icon(iconClass)}<X class={iconClass} />{/snippet}
				</Button>
			{/if}
		</div>
	{/if}
	{@render children?.()}
</dialog>
{/if}

<style>
	@layer elements {
		.modal {
			--dialog-padding-block: var(--s-6);

			width: calc(100% - 2rem);
			max-width: 28rem;
			inset-block-start: var(--visual-viewport-offset-top, 0px);
			inset-block-end: calc(
				100% -
				var(--visual-viewport-offset-top, 0px) -
				var(--visual-viewport-height, 100%)
			);
			max-height: calc(
				var(--visual-viewport-height, 100dvh) -
				2 *
				var(--modal-margin-block)
			);
			overflow-x: hidden;
			overflow-y: auto;
			overscroll-behavior: contain;
			border-radius: 1rem;
			border: 1px solid var(--color-border);
			background-color: var(--color-bg);
			color: var(--color-text);
			padding: var(--dialog-padding-block) var(--s-6);
			text-align: left;
			vertical-align: middle;
			box-shadow:
				0 10px 15px -3px rgba(0, 0, 0, 0.1),
				0 4px 6px -2px rgba(0, 0, 0, 0.05);
			margin: auto;
			outline: none;
			animation: zoom-in-95 300ms ease-out;

			@media (width < 600px) {
				--dialog-padding-block: var(--s-4);
			}

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

		.heading-container {
			border-bottom: var(--border-style);
			padding-block-end: var(--s-2);
			margin-block-end: var(--s-4);
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-block-start: -3px;
		}

		.no-heading {
			margin-block-start: calc(10px - var(--dialog-padding-block));
		}

		.heading {
			font-size: var(--font-lg);
		}

		.initial-focus-sink {
			position: absolute;
		}
	}
</style>
