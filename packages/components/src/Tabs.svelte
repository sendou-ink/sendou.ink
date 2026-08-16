<script lang="ts">
import type { Snippet } from "svelte";
import { setTabsContext } from "./tabs-context.ts";

interface Props {
	selectedKey?: string | null;
	defaultSelectedKey?: string;
	onSelectionChange?: (key: string) => void;
	orientation?: "horizontal" | "vertical";
	/** Should there be padding above the panels. Defaults to true, pass in false if the panel content is managing its own padding. */
	padded?: boolean;
	/** Hide tabs if only one tab shown? Defaults to true. */
	disappearing?: boolean;
	class?: string;
	children: Snippet;
}

let {
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	orientation = "horizontal",
	padded = true,
	disappearing = true,
	class: className,
	children,
}: Props = $props();

// svelte-ignore state_referenced_locally -- controlled vs. uncontrolled is decided once at mount
const isControlled = selectedKey !== undefined;
// svelte-ignore state_referenced_locally -- the default seeds the initial value only
let uncontrolledKey = $state<string | null>(defaultSelectedKey ?? null);
const currentKey = $derived(
	isControlled ? (selectedKey ?? null) : uncontrolledKey,
);

const tabs = new Map<string, HTMLElement>();
let tabOrder = $state<string[]>([]);

function select(key: string) {
	if (!isControlled) {
		uncontrolledKey = key;
	}
	onSelectionChange?.(key);
}

function registerTab(key: string, element: HTMLElement) {
	tabs.set(key, element);
	syncOrder();
	if (!isControlled && uncontrolledKey === null) {
		uncontrolledKey = key;
	}
	return () => {
		tabs.delete(key);
		syncOrder();
	};
}

function syncOrder() {
	tabOrder = [...tabs.entries()]
		.sort(([, a], [, b]) =>
			a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
		)
		.map(([key]) => key);
}

function moveFocus(
	fromKey: string,
	direction: "next" | "previous" | "first" | "last",
) {
	if (tabOrder.length === 0) return;

	const fromIndex = tabOrder.indexOf(fromKey);
	const targetIndex =
		direction === "first"
			? 0
			: direction === "last"
				? tabOrder.length - 1
				: direction === "next"
					? (fromIndex + 1) % tabOrder.length
					: (fromIndex - 1 + tabOrder.length) % tabOrder.length;

	const targetKey = tabOrder[targetIndex];
	tabs.get(targetKey)?.focus();
	select(targetKey);
}

setTabsContext({
	get selectedKey() {
		return currentKey;
	},
	get orientation() {
		return orientation;
	},
	select,
	registerTab,
	moveFocus,
});
</script>

<div
	class={[
		className,
		"root",
		{ padded, disappearing, vertical: orientation === "vertical" },
	]}
>
	{@render children()}
</div>

<style>
	.root {
		--tabs-gap: var(--s-6);
	}

	.root:not(.vertical) {
		display: flex;
		flex-direction: column;
	}

	.padded:not(.vertical) {
		gap: var(--tabs-gap);
	}

	.disappearing {
		&:has(:global(.tabList > div:only-child)) {
			gap: 0;
		}

		& :global(.tabList:has(> div:only-child)) {
			display: none;
		}
	}

	.root :global(.tabListContainer) {
		overflow-x: auto;
		overflow-y: hidden;
	}

	.root :global(.tabList) {
		display: flex;
		flex-direction: row;
		border-bottom: 2px solid var(--color-border);
		min-width: fit-content;
	}

	.root :global(.tabList svg) {
		--icon-size: 16px;
		min-width: var(--icon-size);
		min-height: var(--icon-size);
		max-width: var(--icon-size);
		max-height: var(--icon-size);
		margin-inline-end: var(--s-1-5);
	}

	.root :global(.tabContainer) {
		min-width: fit-content;
		margin-bottom: -2px;
		cursor: pointer;
	}

	.root :global(.tabContainer .tabButton) {
		display: flex;
		align-items: center;
		justify-content: center;
		appearance: none;
		user-select: none;
		height: var(--field-size);
		padding: 0 var(--field-padding);
		font-weight: var(--weight-bold);
		background-color: transparent;
		border: none;
		font-size: var(--font-xs);
		border-radius: 0;
		border-bottom: 2px solid transparent;
		color: var(--color-text-high);
		white-space: nowrap;
		flex: 1;
		transform: none !important;
	}

	.root :global(.tabContainer .tabButton img) {
		min-width: 16px;
		min-height: 16px;
		margin-inline-end: var(--s-1-5);
	}

	.root :global(.tabContainer:focus-visible) {
		outline: var(--focus-ring);
		outline-offset: -2px;
	}

	.root :global(.tabContainer[data-selected] .tabButton) {
		border-color: var(--color-text-accent);
		color: var(--color-text);
	}

	.root :global(.tabContainer:focus-visible .tabButton) {
		color: var(--color-text-accent) !important;
		outline: none;
	}

	.root :global(.fullWidth) {
		width: 100%;
		min-width: 100%;
	}

	.root :global(.fullWidth .tabContainer) {
		flex: 1;
		min-width: 0;
	}

	.root :global(.tabNumber) {
		color: var(--color-text-accent);
		margin-inline-start: var(--s-2);
	}

	.root :global(.tabAlert) {
		margin-inline-start: var(--s-1);
		margin-inline-end: 0 !important;
		color: var(--color-warning);
	}

	.root :global(.sticky) {
		position: sticky;
		top: 47px;
		z-index: 1;
		background-color: var(--color-bg);
	}

	.vertical {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--tabs-gap);
		align-items: start;
	}

	.vertical :global(.tabListContainer) {
		overflow: visible;
		position: sticky;
		top: var(--layout-sticky-top);
		align-self: start;
		background-color: var(--color-bg);
		z-index: 1;
	}

	.vertical :global(.tabList) {
		flex-direction: column;
		border-bottom: none;
		border-inline-end: 2px solid var(--color-border);
		min-width: 0;
	}

	.vertical :global(.tabContainer) {
		margin-bottom: 0;
		margin-inline-end: -2px;
	}

	.vertical :global(.tabContainer[data-selected] .tabButton) {
		border-bottom-color: transparent;
		border-inline-end-color: var(--color-text-accent);
	}

	.vertical :global(.tabButton) {
		justify-content: flex-start;
		border-bottom: none;
		border-inline-end: 2px solid transparent;
		text-align: start;
		flex: none;
		width: 100%;
		padding: var(--s-2) var(--s-3);
		padding-inline-end: var(--s-6);
	}

	.vertical :global(.tabNumber) {
		margin-inline-start: auto;
		padding-inline-start: var(--s-3);
	}

	.vertical :global(.tabPanel) {
		min-width: 0;
	}
</style>
