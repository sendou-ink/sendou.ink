<script lang="ts">
	import type { Snippet } from "svelte";

	export interface PopoverTriggerProps {
		readonly "aria-expanded": boolean;
		readonly "aria-haspopup": "dialog";
		onclick: () => void;
	}

	interface Props {
		trigger: Snippet<[PopoverTriggerProps]>;
		popoverClass?: string;
		onOpenChange?: (isOpen: boolean) => void;
		isOpen?: boolean;
		children: Snippet;
	}

	let {
		trigger,
		popoverClass,
		onOpenChange,
		isOpen,
		children,
	}: Props = $props();

	// svelte-ignore state_referenced_locally -- controlled vs. uncontrolled is decided once at mount
	const isControlled = isOpen !== undefined;
	let uncontrolledOpen = $state(false);
	const open = $derived(isControlled ? Boolean(isOpen) : uncontrolledOpen);

	let triggerContainer = $state<HTMLSpanElement | null>(null);
	let popoverElement = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (open) {
			popoverElement?.showPopover();
			positionPopover();
			requestAnimationFrame(() => popoverElement?.focus());
		} else {
			popoverElement?.hidePopover();
		}
	});

	function setOpen(next: boolean) {
		if (!isControlled) {
			uncontrolledOpen = next;
		}
		onOpenChange?.(next);
	}

	function positionPopover() {
		const triggerElement = triggerContainer?.firstElementChild;
		if (!triggerElement || !popoverElement) return;

		const rect = triggerElement.getBoundingClientRect();
		const popover = popoverElement;
		const popoverRect = popover.getBoundingClientRect();

		const spaceBelow = window.innerHeight - rect.bottom - 8;
		if (popoverRect.height + 8 > spaceBelow && rect.top > spaceBelow) {
			popover.style.top = "auto";
			popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
		} else {
			popover.style.bottom = "auto";
			popover.style.top = `${rect.bottom + 8}px`;
		}

		const centered = rect.left + rect.width / 2 - popoverRect.width / 2;
		popover.style.left = `${Math.max(8, Math.min(centered, window.innerWidth - popoverRect.width - 8))}px`;
	}

	function onPopoverKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
			(triggerContainer?.firstElementChild as HTMLElement | null)?.focus();
		}
	}

	const triggerProps: PopoverTriggerProps = {
		get "aria-expanded"() {
			return open;
		},
		"aria-haspopup": "dialog",
		onclick: () => setOpen(!open),
	};
</script>

<span class="triggerContainer" bind:this={triggerContainer}>
	{@render trigger(triggerProps)}
</span>
<div
	bind:this={popoverElement}
	popover="manual"
	class={["content", popoverClass]}
	role="dialog"
	tabindex="-1"
	onkeydown={onPopoverKeydown}
>
	{@render children()}
</div>
{#if open}
	<div class="backdrop" onclick={() => setOpen(false)} aria-hidden="true"></div>
{/if}

<style>
	.triggerContainer {
		display: contents;
	}

	.content {
		position: fixed;
		margin: 0;
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

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 1;
	}
</style>
