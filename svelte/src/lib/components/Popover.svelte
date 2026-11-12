<!-- Popover opened by the trigger the `trigger` snippet renders with the attributes it is given; native popover API. -->
<script lang="ts">
import type { Snippet } from "svelte";
import type { ClassValue } from "svelte/elements";

interface TriggerAttributes {
	popovertarget: string;
	form: string;
	"aria-haspopup": "dialog";
}

interface Props {
	trigger: Snippet<[TriggerAttributes]>;
	children: Snippet;
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	class?: ClassValue;
}

let {
	trigger,
	children,
	isOpen = $bindable(false),
	onOpenChange,
	class: className,
}: Props = $props();

const id = $props.id();
const popoverId = `${id}-popover`;

let triggerContainer = $state<HTMLSpanElement>();
let popover = $state<HTMLDivElement>();

$effect(() => {
	if (!isOpen && popover?.matches(":popover-open")) popover.hidePopover();
});

function handleToggle(event: ToggleEvent & { currentTarget: HTMLDivElement }) {
	if (event.target !== event.currentTarget) return;

	const next = event.newState === "open";
	if (next !== isOpen) {
		isOpen = next;
		onOpenChange?.(next);
	}
	if (next) placeBelowTrigger(event.currentTarget);
}

// the content is rendered once open, so autofocus targets it in the next frame
function focusOnOpen(element: HTMLElement) {
	requestAnimationFrame(() => {
		(element.querySelector<HTMLElement>("[data-autofocus]") ?? element).focus();
	});
}

function placeBelowTrigger(element: HTMLDivElement) {
	const anchor = triggerContainer?.firstElementChild;
	if (!anchor) return;

	const rect = anchor.getBoundingClientRect();
	element.style.top = `${rect.bottom + window.scrollY + 4}px`;
	element.style.left = `${rect.left + window.scrollX}px`;
}
</script>

<span bind:this={triggerContainer} class="trigger-container">
	{@render trigger({
		popovertarget: popoverId,
		form: "",
		"aria-haspopup": "dialog",
	})}
</span>
<div
	bind:this={popover}
	id={popoverId}
	popover="auto"
	class={["content", className]}
	role="dialog"
	tabindex="-1"
	ontoggle={handleToggle}
>
	{#if isOpen}
		<div {@attach focusOnOpen}>{@render children()}</div>
	{/if}
</div>

<style>
	@layer elements {
		.trigger-container {
			display: contents;
		}

		.content {
			position: absolute;
			inset: auto;
			margin: 0;
			max-width: min(20rem, 100vw);
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
	}
</style>
