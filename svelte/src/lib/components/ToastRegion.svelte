<script lang="ts">
import { Check, CircleAlert, OctagonAlert, X } from "@lucide/svelte";
import { flip } from "svelte/animate";
import type { Attachment } from "svelte/attachments";
import { fade } from "svelte/transition";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { m } from "#lib/paraglide/messages.js";
import Button from "./Button.svelte";
import { toastQueue } from "./toast-queue.svelte.ts";

const FADE_DURATION_MS = 400;

const variantTitles = {
	error: m.common_toasts_error,
	success: m.common_toasts_success,
	info: m.common_toasts_info,
};

// in the top layer only while there is something to show, a manual popover never closes by itself
const shownWhileToasts: Attachment<HTMLElement> = (region) => {
	const hasToasts = toastQueue.toasts.length > 0;
	const isOpen = region.matches(":popover-open");

	if (hasToasts && !isOpen) {
		region.showPopover();
	} else if (!hasToasts && isOpen) {
		const timeout = setTimeout(() => {
			if (toastQueue.toasts.length === 0) region.hidePopover();
		}, FADE_DURATION_MS);
		return () => clearTimeout(timeout);
	}

	return undefined;
};
</script>

<section
	{@attach shownWhileToasts}
	popover="manual"
	aria-label={m.common_notifications_title()}
	class={["toast-region", IS_E2E_TEST_RUN && "hidden"]}
>
	<div class="toast-list">
		{#each toastQueue.toasts as toast (toast.key)}
			<div
				role={toast.content.variant === "error" ? "alert" : "status"}
				class={["toast", toast.content.variant]}
				animate:flip={{ duration: FADE_DURATION_MS }}
				transition:fade={{ duration: FADE_DURATION_MS }}
			>
				<div class="top-row">
					{#if toast.content.variant === "success"}
						<Check class="alert-icon" />
					{:else if toast.content.variant === "error"}
						<OctagonAlert class="alert-icon" />
					{:else}
						<CircleAlert class="alert-icon" />
					{/if}
					{variantTitles[toast.content.variant]()}
					<Button
						variant="minimal"
						class="toast-close-button"
						aria-label="Close"
						onclick={() => toastQueue.close(toast.key)}
					>
						{#snippet icon(iconClass)}<X class={iconClass} />{/snippet}
					</Button>
				</div>
				<div>{toast.content.message}</div>
			</div>
		{/each}
	</div>
</section>

<style>
	@layer elements {
		.toast-region {
			position: fixed;
			inset: unset;
			top: calc(var(--layout-nav-height) + var(--s-2));
			right: calc(10px + var(--scrollbar-width, 0px));
			margin: 0;
			padding: 0;
			border: none;
			background: transparent;
			color: var(--color-text);
			overflow: visible;
			outline: none;
		}

		.toast-list {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.toast {
			background: var(--color-info-low);
			border-radius: var(--radius-box);
			padding: var(--s-1-5) var(--s-3);
			align-items: center;
			justify-content: center;
			font-size: var(--font-sm);
			font-weight: var(--weight-semi);
			gap: var(--s-1);
			border: 2px solid var(--color-info);
			width: 250px;
			outline: none;

			& :global(.alert-icon) {
				width: 1.25rem;
			}
		}

		.top-row {
			display: flex;
			text-transform: uppercase;
			color: var(--color-info-high);
			font-size: var(--font-xs);
			gap: var(--s-2);
			align-items: center;

			& :global(.toast-close-button) {
				margin-inline-start: auto;
				margin-inline-end: calc(var(--s-1) * -1);
				height: auto;
				padding: var(--s-1);
				border-radius: var(--radius-box);
				color: inherit;
				opacity: 0.75;
			}

			& :global(.toast-close-button:hover) {
				opacity: 1;
			}

			& :global(.toast-close-button svg) {
				width: 1rem;
			}
		}

		.error {
			border-color: var(--color-error);
			background-color: var(--color-error-low);

			& .top-row {
				color: var(--color-error-high);
			}
		}

		.success {
			border-color: var(--color-success);
			background-color: var(--color-success-low);

			& .top-row {
				color: var(--color-success-high);
			}
		}
	}
</style>
