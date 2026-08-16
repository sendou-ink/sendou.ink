<script lang="ts">
import type { Snippet } from "svelte";
import { closePopoverOnScrollClip } from "./popover-scroll-close.svelte.ts";

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

closePopoverOnScrollClip({
	isOpen: () => open,
	element: () => popoverElement,
	close: () => setOpen(false),
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
