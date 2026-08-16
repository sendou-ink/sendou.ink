<script lang="ts">
import type { Snippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { setSelectContext } from "./select-context.ts";

interface Props {
	label?: string;
	placeholder?: string;
	selectedKey?: string | number | null;
	defaultSelectedKey?: string | number;
	onSelectionChange?: (key: string | number | null) => void;
	onOpenChange?: (isOpen: boolean) => void;
	clearable?: boolean;
	isDisabled?: boolean;
	isRequired?: boolean;
	testId?: string;
	"aria-label"?: string;
	search?: { placeholder?: string };
	searchValue?: string;
	noResultsText?: string;
	clearText?: string;
	popoverClass?: string;
	/** Trigger content for the selected item; falls back to the item's registered text value. */
	valueContent?: Snippet<[string | number]>;
	children: Snippet;
}

let {
	label,
	placeholder,
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	onOpenChange,
	clearable = false,
	isDisabled,
	isRequired,
	testId,
	"aria-label": ariaLabel,
	search,
	searchValue = $bindable(""),
	noResultsText = "No results",
	clearText = "Clear",
	popoverClass,
	valueContent,
	children,
}: Props = $props();

// svelte-ignore state_referenced_locally -- controlled vs. uncontrolled is decided once at mount
const isControlled = selectedKey !== undefined;
// svelte-ignore state_referenced_locally -- the default seeds the initial value only
let uncontrolledKey = $state<string | number | null>(
	defaultSelectedKey ?? null,
);
const currentKey = $derived(
	isControlled ? (selectedKey ?? null) : uncontrolledKey,
);

let open = $state(false);
let focusedKey = $state<string | number | null>(null);

interface RegisteredItem {
	element: HTMLElement;
	textValue: string;
	disabled: boolean;
}
const items = new SvelteMap<string | number, RegisteredItem>();

let triggerElement = $state<HTMLButtonElement | null>(null);
let popoverElement = $state<HTMLDivElement | null>(null);
let searchInputElement = $state<HTMLInputElement | null>(null);

const selectedText = $derived(
	currentKey !== null ? items.get(currentKey)?.textValue : undefined,
);

setSelectContext({
	get selectedKey() {
		return currentKey;
	},
	get focusedKey() {
		return focusedKey;
	},
	registerItem(key, element, options) {
		items.set(key, { element, ...options });
		return () => {
			items.delete(key);
		};
	},
	select(key) {
		commitSelection(key);
	},
	setFocusedKey(key) {
		focusedKey = key;
	},
});

function commitSelection(key: string | number | null) {
	if (!isControlled) {
		uncontrolledKey = key;
	}
	onSelectionChange?.(key);
	setOpen(false);
	triggerElement?.focus();
}

function setOpen(next: boolean) {
	if (open === next) return;
	open = next;
	onOpenChange?.(next);

	if (next) {
		popoverElement?.showPopover();
		positionPopover();
		focusedKey = currentKey ?? orderedKeys(false)[0] ?? null;
		requestAnimationFrame(() => {
			if (search) {
				searchInputElement?.focus();
			} else {
				popoverElement?.focus();
			}
			scrollFocusedIntoView();
		});
	} else {
		popoverElement?.hidePopover();
		searchValue = "";
		focusedKey = null;
	}
}

function positionPopover() {
	if (!triggerElement || !popoverElement) return;

	const rect = triggerElement.getBoundingClientRect();
	const popover = popoverElement;
	popover.style.width = `${rect.width}px`;
	popover.style.left = `${rect.left}px`;

	const maxHeight = 300;
	const spaceBelow = window.innerHeight - rect.bottom - 8;
	if (spaceBelow < 150) {
		popover.style.top = "auto";
		popover.style.bottom = `${window.innerHeight - rect.top + 4}px`;
		popover.style.maxHeight = `${Math.min(maxHeight, rect.top - 8)}px`;
	} else {
		popover.style.bottom = "auto";
		popover.style.top = `${rect.bottom + 4}px`;
		popover.style.maxHeight = `${Math.min(maxHeight, spaceBelow)}px`;
	}
}

function orderedKeys(visibleOnly = true) {
	void visibleOnly;
	return [...items.entries()]
		.filter(([, item]) => !item.disabled)
		.sort(([, a], [, b]) =>
			a.element.compareDocumentPosition(b.element) &
			Node.DOCUMENT_POSITION_FOLLOWING
				? -1
				: 1,
		)
		.map(([key]) => key);
}

function moveFocus(direction: "next" | "previous" | "first" | "last") {
	const keys = orderedKeys();
	if (keys.length === 0) return;

	const currentIndex = focusedKey === null ? -1 : keys.indexOf(focusedKey);
	const targetIndex =
		direction === "first"
			? 0
			: direction === "last"
				? keys.length - 1
				: direction === "next"
					? Math.min(currentIndex + 1, keys.length - 1)
					: Math.max(currentIndex - 1, 0);

	focusedKey = keys[targetIndex];
	scrollFocusedIntoView();
}

function scrollFocusedIntoView() {
	if (focusedKey === null) return;
	items.get(focusedKey)?.element.scrollIntoView({ block: "nearest" });
}

function onTriggerKeydown(event: KeyboardEvent) {
	if (
		event.key === "ArrowDown" ||
		event.key === "ArrowUp" ||
		event.key === "Enter" ||
		event.key === " "
	) {
		event.preventDefault();
		setOpen(true);
	}
}

function onPopoverKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		event.preventDefault();
		setOpen(false);
		triggerElement?.focus();
		return;
	}
	if (event.key === "ArrowDown") {
		event.preventDefault();
		moveFocus("next");
		return;
	}
	if (event.key === "ArrowUp") {
		event.preventDefault();
		moveFocus("previous");
		return;
	}
	if (event.key === "Home" && !search) {
		event.preventDefault();
		moveFocus("first");
		return;
	}
	if (event.key === "End" && !search) {
		event.preventDefault();
		moveFocus("last");
		return;
	}
	if (event.key === "Enter") {
		event.preventDefault();
		if (focusedKey !== null && !items.get(focusedKey)?.disabled) {
			commitSelection(focusedKey);
		}
	}
}

function onPopoverToggle(event: Event) {
	const toggleEvent = event as ToggleEvent;
	if (toggleEvent.newState === "closed" && open) {
		open = false;
		onOpenChange?.(false);
		searchValue = "";
		focusedKey = null;
	}
}

const hasVisibleItems = $derived(items.size > 0);

const uid = $props.id();
const labelId = $derived(label ? `${uid}-select-label` : undefined);
const valueId = `${uid}-select-value`;
</script>

<svelte:window
	onresize={() => open && positionPopover()}
	onscroll={() => open && positionPopover()}
/>

<div class="select" data-testid={testId}>
	{#if label}
		<span class="label" id={labelId}>{label}</span>
	{/if}
	<button
		type="button"
		class="button"
		bind:this={triggerElement}
		disabled={isDisabled}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={ariaLabel}
		aria-labelledby={labelId && !ariaLabel ? `${valueId} ${labelId}` : undefined}
		data-required={isRequired || undefined}
		onclick={() => setOpen(!open)}
		onkeydown={onTriggerKeydown}
	>
		<span id={valueId} class="selectValue" data-placeholder={selectedText === undefined ? "true" : undefined}>
			{#if currentKey !== null && valueContent}
				{@render valueContent(currentKey)}
			{:else if selectedText !== undefined}
				{selectedText}
			{:else}
				{placeholder}
			{/if}
		</span>
		<span aria-hidden="true">
			<svg
				class="icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m7 15 5 5 5-5" />
				<path d="m7 9 5-5 5 5" />
			</svg>
		</span>
	</button>
	{#if clearable && currentKey !== null}
		<button
			type="button"
			class="clearButton"
			onclick={() => commitSelection(null)}
		>
			<svg
				class="clearIcon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
			{clearText}
		</button>
	{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -- keydown steers the listbox inside -->
	<div
		bind:this={popoverElement}
		popover="manual"
		class={["popover", popoverClass]}
		ontoggle={onPopoverToggle}
		onkeydown={onPopoverKeydown}
		tabindex="-1"
	>
		{#if search}
			<div class="searchField" data-empty={searchValue === "" ? "true" : undefined}>
				<svg
					class="icon"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.3-4.3" />
				</svg>
				<input
					type="search"
					bind:this={searchInputElement}
					bind:value={searchValue}
					placeholder={search.placeholder}
					aria-label="Search"
					class="searchInput in-container"
				/>
				<button
					type="button"
					class="searchClearButton"
					tabindex="-1"
					aria-label="Clear"
					onclick={() => {
						searchValue = "";
						searchInputElement?.focus();
					}}
				>
					<svg
						class="icon"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
			</div>
		{/if}
		<div class="listBox scrollbar" role="listbox" aria-labelledby={labelId}>
			{@render children()}
			{#if !hasVisibleItems}
				<div class="noResults">{noResultsText}</div>
			{/if}
		</div>
	</div>
</div>

{#if open}
	<div
		class="backdrop"
		onclick={() => setOpen(false)}
		aria-hidden="true"
	></div>
{/if}

<style>
	.select {
		width: 100%;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--s-1-5);
	}

	.label {
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
		margin: 0;
		display: block;
		text-box: trim-start cap alphabetic;
	}

	.button {
		height: var(--field-size);
		padding: 0 var(--field-padding);
		border: var(--border-style);
		border-radius: var(--radius-field);
		background-color: var(--color-bg);
		outline: none;

		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-1-5);
		width: 100%;
		cursor: pointer;

		&:focus-visible,
		&[aria-expanded="true"] {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}

		&:disabled {
			pointer-events: none;
			cursor: not-allowed;
			opacity: 0.5;
			outline: none;
		}
	}

	.selectValue {
		font-size: var(--font-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		color: var(--color-text);
		display: flex;
		align-items: center;

		&[data-placeholder] {
			color: var(--color-text-high);
		}
	}

	.icon {
		min-width: 18px;
		max-width: 18px;
		color: var(--color-text-high);
	}

	.popover {
		position: fixed;
		margin: 0;
		padding: var(--s-1);
		border: var(--border-style);
		border-radius: var(--radius-box);
		background-color: var(--color-bg);
		outline: none;
		color: var(--color-text);

		display: none;
		flex-direction: column;

		&:popover-open {
			display: flex;
		}
	}

	.listBox {
		overflow: auto;
		flex: 1;
	}

	.searchField {
		position: relative;
		display: flex;
		gap: var(--s-2);

		border-bottom: 1px solid var(--color-border);
		border-radius: 0;
		accent-color: var(--color-accent);
		color: var(--color-text);
		outline: none;
		padding: var(--s-1-5) var(--s-1-5) calc(var(--s-0-5) + var(--s-2))
			var(--s-1-5);
		margin-block-end: var(--s-1-5);

		&[data-empty] .searchClearButton {
			visibility: hidden;
		}
	}

	.searchInput {
		all: unset;
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		letter-spacing: 0.5px;
		flex: 1;
		min-width: 0;
		padding-inline-end: calc(18px + var(--s-2));

		&::-webkit-search-cancel-button {
			display: none;
		}

		&::placeholder {
			color: var(--color-text-high);
		}
	}

	.searchClearButton {
		position: absolute;
		right: var(--s-2);
		top: 50%;
		transform: translateY(-50%);
		background-color: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--color-text-high);
	}

	.noResults {
		font-size: var(--font-md);
		font-weight: var(--weight-bold);
		text-align: center;
		padding-block: var(--s-8);
		color: var(--color-text-high);
	}

	.clearButton {
		position: absolute;
		bottom: -21px;
		right: 9px;

		display: flex;
		align-items: center;
		border: none;
		background-color: transparent;
		color: var(--color-error);
		cursor: pointer;
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		height: var(--field-size-xs);
		padding: 0;
	}

	.clearIcon {
		min-width: 14px;
		max-width: 14px;
		margin-inline-end: var(--s-1);
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 1;
	}
</style>
