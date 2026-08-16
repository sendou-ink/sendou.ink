<script lang="ts">
	import type { Snippet } from "svelte";
	import { getSelectContext } from "./select-context.ts";

	interface Props {
		id: string | number;
		textValue: string;
		isDisabled?: boolean;
		children: Snippet;
	}

	let { id, textValue, isDisabled = false, children }: Props = $props();

	const select = getSelectContext();

	const isSelected = $derived(select.selectedKey === id);
	const isFocused = $derived(select.focusedKey === id);

	function register(element: HTMLElement) {
		return select.registerItem(id, element, {
			textValue,
			disabled: isDisabled,
		});
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -- keyboard handled by the listbox popover -->
<div
	class={["item", { itemFocused: isFocused, itemSelected: isSelected }]}
	role="option"
	tabindex={-1}
	aria-selected={isSelected}
	aria-disabled={isDisabled || undefined}
	data-disabled={isDisabled ? "true" : undefined}
	onclick={() => {
		if (!isDisabled) select.select(id);
	}}
	onpointermove={() => {
		if (!isDisabled) select.setFocusedKey(id);
	}}
	{@attach register}
>
	{@render children()}
</div>

<style>
	.item {
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
		padding: var(--s-1-5);
		border-radius: var(--radius-field);
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		cursor: pointer;

		&[data-disabled] {
			color: var(--color-text-high);
			cursor: not-allowed;
		}
	}

	.itemFocused {
		background-color: var(--color-bg-high);
		color: var(--color-text);
	}

	.itemSelected {
		color: var(--color-text-accent);
		font-weight: var(--weight-bold);
	}
</style>
