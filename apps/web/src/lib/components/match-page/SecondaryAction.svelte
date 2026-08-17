<script lang="ts">
import { ChevronUp } from "@lucide/svelte";
import { Button } from "@sendou/components";
import type { Snippet } from "svelte";

interface Props {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	collapsedLabel: string;
	collapsedIcon?: Snippet;
	expandedAriaLabel?: string;
	/**
	 * Always-open variant used when this is the only content in the tab (no
	 * primary action to sit underneath). Hides the collapse toggle and drops the
	 * striped footer styling.
	 */
	standalone?: boolean;
	/**
	 * Forces the expanded state and hides the collapse toggle while keeping the
	 * footer styling. Used when the expanded content is small enough that
	 * collapsing brings no benefit.
	 */
	alwaysOpen?: boolean;
	children: Snippet;
}

/**
 * Generic panel hosting follow-up match actions (e.g. scrim map list
 * management). Defaults to a striped footer attached beneath the primary
 * action card; pass `standalone` when it is the only tab content.
 */
let {
	isOpen,
	onOpenChange,
	collapsedLabel,
	collapsedIcon,
	expandedAriaLabel,
	standalone,
	alwaysOpen,
	children,
}: Props = $props();

const collapsible = $derived(!standalone && !alwaysOpen);
</script>

{#if !isOpen && collapsible}
	<div class={["collapsed", { footer: !standalone }]}>
		<Button
			variant="minimal"
			size="small"
			icon={collapsedIcon}
			onclick={() => onOpenChange(true)}
		>
			{collapsedLabel}
		</Button>
	</div>
{:else}
	<div class={["expanded", { footer: !standalone }]}>
		{#if collapsible}
			<Button
				variant="minimal"
				size="miniscule"
				onclick={() => onOpenChange(false)}
				class="collapseButton"
				aria-label={expandedAriaLabel ?? collapsedLabel}
			>
				{#snippet icon()}<ChevronUp size={22} />{/snippet}
			</Button>
		{/if}
		{@render children()}
	</div>
{/if}

<style>
	.collapsed {
		display: flex;
		justify-content: center;
	}

	.collapsed.footer {
		background-color: var(--color-bg-higher);
		border-radius: 0 0 var(--radius-box) var(--radius-box);
		padding: var(--s-2);
		margin: var(--s-4) calc(-1 * var(--s-4)) calc(-1 * var(--s-6));
	}

	.expanded {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-4);
		container-type: inline-size;
		position: relative;
	}

	.expanded.footer {
		background-color: var(--color-bg-higher);
		border-radius: 0 0 var(--radius-box) var(--radius-box);
		padding: var(--s-4);
		margin: var(--s-4) calc(-1 * var(--s-4)) calc(-1 * var(--s-6));
	}

	.expanded :global(.collapseButton) {
		position: absolute;
		inset-block-start: var(--s-2);
		inset-inline-end: var(--s-3);
	}

	.expanded :global(.collapseButton svg) {
		min-width: 22px;
		max-width: 22px;
	}
</style>
