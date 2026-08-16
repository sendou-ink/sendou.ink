<script lang="ts">
	import type { Snippet } from "svelte";
	import { setMenuContext, type MenuTriggerProps } from "./menu-context.ts";

	interface Props {
		trigger: Snippet<[MenuTriggerProps]>;
		scrolling?: boolean;
		opensLeft?: boolean;
		popoverClass?: string;
		children: Snippet;
	}

	let {
		trigger,
		scrolling,
		opensLeft,
		popoverClass,
		children,
	}: Props = $props();

	let open = $state(false);
	let triggerContainer = $state<HTMLSpanElement | null>(null);
	let popoverElement = $state<HTMLDivElement | null>(null);

	function setOpen(next: boolean) {
		if (open === next) return;
		open = next;

		if (next) {
			popoverElement?.showPopover();
			positionPopover();
			requestAnimationFrame(() => {
				focusItem("first");
			});
		} else {
			popoverElement?.hidePopover();
		}
	}

	function positionPopover() {
		const triggerElement = triggerContainer?.firstElementChild;
		if (!triggerElement || !popoverElement) return;

		const rect = triggerElement.getBoundingClientRect();
		const popover = popoverElement;
		popover.style.top = `${rect.bottom + 8}px`;

		const popoverWidth = popover.getBoundingClientRect().width;
		const alignedLeft = opensLeft
			? rect.left
			: rect.right - popoverWidth;
		popover.style.left = `${Math.max(8, Math.min(alignedLeft, window.innerWidth - popoverWidth - 8))}px`;
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
			setOpen(false);
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
			setOpen(false);
		},
	});

	const triggerProps: MenuTriggerProps = {
		get "aria-expanded"() {
			return open;
		},
		"aria-haspopup": "menu",
		onclick: () => setOpen(!open),
	};
</script>

<span class="triggerContainer" bind:this={triggerContainer}>
	{@render trigger(triggerProps)}
</span>
<!-- svelte-ignore a11y_no_static_element_interactions -- keydown steers the menu inside -->
<div
	bind:this={popoverElement}
	popover="manual"
	class={["popover", "scrollbar", popoverClass, { scrolling }]}
	onkeydown={onPopoverKeydown}
>
	<div class="itemsContainer" role="menu">
		{@render children()}
	</div>
</div>
{#if open}
	<div class="backdrop" onclick={() => setOpen(false)} aria-hidden="true"></div>
{/if}

<style>
	.triggerContainer {
		display: contents;
	}

	.popover {
		position: fixed;
		margin: 0;
		border-radius: var(--radius-box);
		background-color: var(--color-bg-high);
		border: var(--border-style);
		width: max-content;
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
		padding: var(--s-2);
		color: var(--color-text);
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

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 1;
	}
</style>
