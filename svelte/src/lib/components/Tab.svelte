<script lang="ts">
import { TriangleAlert } from "@lucide/svelte";
import type { Snippet } from "svelte";
import { focusMoveForKey } from "~/utils/roving-focus";
import Button from "./Button.svelte";
import { getTabsContext } from "./tabs-context.ts";

interface Props {
	id: string;
	icon?: Snippet;
	number?: number;
	/** warning-colored alert icon on the tab */
	alert?: boolean;
	isDisabled?: boolean;
	href?: string;
	testId?: string;
	children?: Snippet;
}

let {
	id,
	icon,
	number,
	alert,
	isDisabled,
	href,
	testId,
	children,
}: Props = $props();

const tabs = getTabsContext();

const selected = $derived(tabs.selectedKey === id);

function onkeydown(event: KeyboardEvent) {
	const move = focusMoveForKey(event.key, tabs.orientation);
	if (!move) return;

	event.preventDefault();
	tabs.moveFocus(id, move);
}

function register(element: HTMLElement) {
	if (isDisabled) return;
	return tabs.registerTab(id, element);
}
</script>

{#snippet content()}
	<Button isLook class="tab-button">
		{@render icon?.()}
		{@render children?.()}
		{#if typeof number === "number" && number !== 0}
			<span class="tab-number">{number}</span>
		{/if}
		{#if alert}<TriangleAlert class="tab-alert" />{/if}
	</Button>
{/snippet}

{#if href && !isDisabled}
	<a
		{href}
		{@attach register}
		role="tab"
		id={`tab-${id}`}
		aria-selected={selected}
		aria-controls={`tabpanel-${id}`}
		tabindex={selected ? 0 : -1}
		data-selected={selected ? "true" : undefined}
		data-testid={testId}
		class="tab-container"
		{onkeydown}
		onclick={() => tabs.select(id)}
	>
		{@render content()}
	</a>
{:else}
	<div
		{@attach register}
		role="tab"
		id={`tab-${id}`}
		aria-selected={selected}
		aria-controls={`tabpanel-${id}`}
		aria-disabled={isDisabled || undefined}
		tabindex={selected ? 0 : -1}
		data-selected={selected ? "true" : undefined}
		data-testid={testId}
		class={["tab-container", isDisabled && "tab-disabled"]}
		{onkeydown}
		onclick={() => {
			if (!isDisabled) tabs.select(id);
		}}
	>
		{@render content()}
	</div>
{/if}

<style>
	@layer elements {
		.tab-container {
			min-width: fit-content;
			margin-bottom: -2px;

			& :global(.tab-button) {
				background-color: transparent;
				border: none;
				font-size: var(--font-xs);
				border-radius: 0;
				border-bottom: 2px solid transparent;
				color: var(--color-text-high);
				white-space: nowrap;
				flex: 1;
				transform: none !important;
				--button-hover-bg: transparent;

				& :global(img) {
					min-width: 16px;
					min-height: 16px;
					margin-inline-end: var(--s-1-5);
				}
			}

			&:focus-visible {
				outline: var(--focus-ring);
				outline-offset: -2px;
			}

			&:hover:not([aria-disabled]) :global(.tab-button),
			&[data-selected] :global(.tab-button) {
				color: var(--color-text);
			}

			&[data-selected] :global(.tab-button) {
				border-color: var(--color-fg-accent);
			}

			&:focus-visible :global(.tab-button) {
				color: var(--color-fg-accent) !important;
				outline: none;
			}
		}

		.tab-number {
			color: var(--color-fg-accent);
			margin-inline-start: var(--s-2);
		}

		.tab-container :global(.tab-alert) {
			margin-inline-start: var(--s-1);
			margin-inline-end: 0 !important;
			color: var(--color-warning);
		}

		:global(.vertical) .tab-container {
			margin-bottom: 0;
			margin-inline-end: -2px;

			& :global(.tab-button) {
				justify-content: flex-start;
				border-bottom: none;
				border-inline-end: 2px solid transparent;
				text-align: start;
				flex: none;
				width: 100%;
				padding: var(--s-2) var(--s-3);
				padding-inline-end: var(--s-6);
			}

			&[data-selected] :global(.tab-button) {
				border-bottom-color: transparent;
				border-inline-end-color: var(--color-fg-accent);
			}

			& .tab-number {
				margin-inline-start: auto;
				padding-inline-start: var(--s-3);
			}
		}
	}
</style>
