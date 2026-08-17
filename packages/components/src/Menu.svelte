<script lang="ts">
import type { Snippet } from "svelte";
import { type MenuTriggerProps, setMenuContext } from "./menu-context.ts";
import { closePopoverOnScrollClip } from "./popover-scroll-close.svelte.ts";

interface Props {
	trigger: Snippet<[MenuTriggerProps]>;
	scrolling?: boolean;
	opensLeft?: boolean;
	popoverClass?: string;
	children: Snippet;
}

let { trigger, scrolling, opensLeft, popoverClass, children }: Props = $props();

let open = $state(false);
let triggerContainer = $state<HTMLSpanElement | null>(null);
let popoverElement = $state<HTMLDivElement | null>(null);

const uid = $props.id();
const popoverId = `${uid}-menu`;
const anchorName = `--menu-anchor-${uid}`;

closePopoverOnScrollClip({
	isOpen: () => open,
	element: () => popoverElement,
	close: () => popoverElement?.hidePopover(),
});

function onPopoverToggle(event: Event) {
	const next = (event as ToggleEvent).newState === "open";
	if (next === open) return;
	open = next;

	if (next) {
		requestAnimationFrame(() => {
			focusItem("first");
		});
	}
}

function menuItems() {
	return [
		...(popoverElement?.querySelectorAll<HTMLElement>(
			'[role="menuitem"]:not([aria-disabled="true"])',
		) ?? []),
	];
}

function focusItem(target: "first" | "last" | "next" | "previous") {
	const elements = menuItems();
	if (elements.length === 0) return;

	const activeIndex = elements.findIndex(
		(element) => element === document.activeElement,
	);
	const targetIndex =
		target === "first"
			? 0
			: target === "last"
				? elements.length - 1
				: target === "next"
					? (activeIndex + 1) % elements.length
					: (activeIndex - 1 + elements.length) % elements.length;

	elements[targetIndex].focus();
}

function onPopoverKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		event.preventDefault();
		popoverElement?.hidePopover();
		(triggerContainer?.firstElementChild as HTMLElement | null)?.focus();
		return;
	}
	if (event.key === "ArrowDown") {
		event.preventDefault();
		focusItem("next");
		return;
	}
	if (event.key === "ArrowUp") {
		event.preventDefault();
		focusItem("previous");
		return;
	}
	if (event.key === "Home") {
		event.preventDefault();
		focusItem("first");
		return;
	}
	if (event.key === "End") {
		event.preventDefault();
		focusItem("last");
	}
}

setMenuContext({
	close() {
		popoverElement?.hidePopover();
	},
});

const triggerProps: MenuTriggerProps = {
	popovertarget: popoverId,
	get "aria-expanded"() {
		return open;
	},
	"aria-haspopup": "menu",
};
</script>

<!-- xxx: fix always first item selected -->
<span
	class="triggerContainer"
	bind:this={triggerContainer}
	style:--menu-anchor={anchorName}
>
	{@render trigger(triggerProps)}
</span>
<!-- svelte-ignore a11y_no_static_element_interactions -- keydown steers the menu inside -->
<div
	bind:this={popoverElement}
	id={popoverId}
	popover="auto"
	class={["popover", "scrollbar", popoverClass, { scrolling, opensLeft }]}
	style:position-anchor={anchorName}
	ontoggle={onPopoverToggle}
	onkeydown={onPopoverKeydown}
>
	<div class="itemsContainer" role="menu">
		{#if open}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.triggerContainer {
		display: contents;

		> :global(*) {
			anchor-name: var(--menu-anchor);
		}
	}

	.popover {
		position: fixed;
		position-area: block-end span-inline-start;
		position-try-fallbacks: flip-block;
		margin: var(--s-2) 0;
		border-radius: var(--radius-box);
		background-color: var(--color-bg-high);
		border: var(--border-style);
		width: max-content;
		max-width: calc(100vw - var(--s-4));
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
		padding: var(--s-2);
		color: var(--color-text);
	}

	.opensLeft {
		position-area: block-end span-inline-end;
	}

	.scrolling {
		max-height: 300px !important;
		overflow-y: auto;
	}

	.itemsContainer {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);

		&:focus-visible {
			outline: none;
		}
	}
</style>
