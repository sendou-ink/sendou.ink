<script lang="ts">
import type { Snippet } from "svelte";
import { ElementVisibility } from "./element-visibility.ts";

export interface PopoverTriggerProps {
	readonly popovertarget: string;
	readonly "aria-haspopup": "dialog";
}

interface Props {
	trigger: Snippet<[PopoverTriggerProps]>;
	popoverClass?: string;
	onOpenChange?: (isOpen: boolean) => void;
	isOpen?: boolean;
	children: Snippet;
}

let { trigger, popoverClass, onOpenChange, isOpen, children }: Props = $props();

const VISIBLE_RATIO_THRESHOLD = 0.98;

// svelte-ignore state_referenced_locally -- controlled vs. uncontrolled is decided once at mount
const isControlled = isOpen !== undefined;
let uncontrolledOpen = $state(false);
const open = $derived(isControlled ? Boolean(isOpen) : uncontrolledOpen);

const uid = $props.id();
const popoverId = `${uid}-popover`;
const anchorName = `--popover-anchor-${uid}`;

let popoverElement = $state<HTMLDivElement | null>(null);

$effect(() => {
	if (!popoverElement) return;
	if (open && !popoverElement.matches(":popover-open")) {
		popoverElement.showPopover();
	} else if (!open && popoverElement.matches(":popover-open")) {
		popoverElement.hidePopover();
	}
});

const visibility = new ElementVisibility(() => {
	if (!open || !popoverElement) return null;
	return {
		element: popoverElement,
		marginTop: popoverBoundaryTop(popoverElement),
		threshold: VISIBLE_RATIO_THRESHOLD,
	};
});

// a popover too tall to ever fit fully (or one measured before it is shown)
// must not close itself; only a fully visible popover that scroll clips does
let wasFullyVisible = false;

$effect(() => {
	if (!open) {
		wasFullyVisible = false;
		return;
	}

	const ratio = visibility.ratio;
	if (ratio === null) return;

	if (ratio >= VISIBLE_RATIO_THRESHOLD) {
		wasFullyVisible = true;
	} else if (wasFullyVisible) {
		setOpen(false);
	}
});

function setOpen(next: boolean) {
	if (!isControlled) {
		uncontrolledOpen = next;
	}
	onOpenChange?.(next);
}

function onPopoverToggle(event: Event) {
	const toggleEvent = event as ToggleEvent;
	const next = toggleEvent.newState === "open";
	if (next !== open) {
		setOpen(next);
	}
	if (next) {
		popoverElement?.focus();
	}
}

const triggerProps: PopoverTriggerProps = {
	popovertarget: popoverId,
	"aria-haspopup": "dialog",
};

function popoverBoundaryTop(element: Element) {
	return (
		Number.parseFloat(
			getComputedStyle(element).getPropertyValue("--popover-boundary-top"),
		) || 0
	);
}
</script>

<span class="triggerContainer" style:--popover-anchor={anchorName}>
	{@render trigger(triggerProps)}
</span>
<div
	bind:this={popoverElement}
	id={popoverId}
	popover="auto"
	class={["content", popoverClass]}
	style:position-anchor={anchorName}
	role="dialog"
	tabindex="-1"
	ontoggle={onPopoverToggle}
>
	{@render children()}
</div>

<style>
	.triggerContainer {
		display: contents;

		> :global(*) {
			anchor-name: var(--popover-anchor);
		}
	}

	.content {
		position: fixed;
		position-area: block-end;
		position-try-fallbacks: flip-block;
		justify-self: anchor-center;
		margin: var(--s-2);
		max-width: min(20rem, calc(100vw - var(--s-4)));
		overflow: auto;
		padding: var(--s-2);
		border: var(--border-style);
		border-radius: var(--radius-box);
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
		white-space: pre-wrap;
		background-color: var(--color-bg);
		color: var(--color-text);
		outline: none;
	}
</style>
