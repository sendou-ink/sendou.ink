<!-- Accessible tabs, the twin of the React SendouTabs: `TabList` with `Tab`s, then a `TabPanel` per tab. -->
<script lang="ts">
import type { Snippet } from "svelte";
import type { ClassValue } from "svelte/elements";
import { rovingFocusIndex } from "~/utils/roving-focus";
import { setTabsContext, type TabsOrientation } from "./tabs-context.ts";

interface Props {
	/** Controlled selection; leave out to let the first registered tab be selected. */
	selectedKey?: string | null;
	onSelectionChange?: (key: string) => void;
	orientation?: TabsOrientation;
	/** Padding above the panels, default true. */
	padded?: boolean;
	/** Hide tabs if only one tab shown, default true. */
	disappearing?: boolean;
	class?: ClassValue;
	children: Snippet;
}

let {
	selectedKey,
	onSelectionChange,
	orientation = "horizontal",
	padded = true,
	disappearing = true,
	class: className,
	children,
}: Props = $props();

// svelte-ignore state_referenced_locally (controlled or not is decided once, like the React tabs)
const isControlled = selectedKey !== undefined;
let uncontrolledKey = $state<string | null>(null);
const currentKey = $derived(
	isControlled ? (selectedKey ?? null) : uncontrolledKey,
);

const tabs = new Map<string, HTMLElement>();

function select(key: string) {
	if (!isControlled) uncontrolledKey = key;
	onSelectionChange?.(key);
}

function orderedKeys() {
	return [...tabs.entries()]
		.toSorted(([, a], [, b]) =>
			a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
		)
		.map(([key]) => key);
}

setTabsContext({
	get selectedKey() {
		return currentKey;
	},
	get orientation() {
		return orientation;
	},
	select,
	registerTab: (key, element) => {
		tabs.set(key, element);
		if (!isControlled && uncontrolledKey === null) uncontrolledKey = key;
		return () => {
			tabs.delete(key);
		};
	},
	moveFocus: (fromKey, direction) => {
		const keys = orderedKeys();
		if (keys.length === 0) return;

		const targetKey =
			keys[
				rovingFocusIndex(direction, keys.indexOf(fromKey), keys.length, {
					wrap: true,
				})
			];
		tabs.get(targetKey)?.focus();
		select(targetKey);
	},
});
</script>

<div
	class={[
		className,
		"root",
		padded && "padded",
		disappearing && "disappearing",
		orientation === "vertical" && "vertical",
	]}
>
	{@render children()}
</div>

<style>
	@layer elements {
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
			&:has(:global(.tab-list > :only-child)) {
				gap: 0;
			}

			& :global(.tab-list:has(> :only-child)) {
				display: none;
			}

			& :global(.tab-list-row:has(.tab-list > :only-child) .tab-list-actions) {
				border: none;
				padding-bottom: var(--s-2);

				&::before {
					display: none;
				}
			}
		}

		.vertical {
			display: grid;
			grid-template-columns: max-content 1fr;
			gap: var(--tabs-gap);
			align-items: start;
		}
	}
</style>
