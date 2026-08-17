<!--
@component
Generic filter pill bar: active filters render as pills opening a popover with
the filter's inputs, hidden filters are added via the "Add filter" menu, and an
optional reset button plus extra actions render at the end.
-->
<script lang="ts">
import { ChevronDown, Plus, RotateCcw, X } from "@lucide/svelte";
import { Button, Menu, MenuItem, Popover } from "@sendou/components";
import type { Snippet } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { m } from "#lib/paraglide/messages.js";
import type { FilterBarPill } from "./filter-bar-types.ts";

interface Props {
	pills: FilterBarPill[];
	/** Resets every pill's param(s) to defaults. Renders the reset button. */
	onReset?: () => void;
	actions?: Snippet;
}

let { pills, onReset, actions }: Props = $props();

const justAddedKeys = new SvelteSet<string>();
let openPillKey = $state<string | null>(null);

const visiblePills = $derived(pills.filter(isVisible));
const hiddenPills = $derived(pills.filter((pill) => !isVisible(pill)));

function isVisible(pill: FilterBarPill) {
	return pill.formattedValue !== null || justAddedKeys.has(pill.key);
}

function addPill(pill: FilterBarPill) {
	justAddedKeys.add(pill.key);
	openPillKey = pill.key;
	pill.onAdd?.();
}

function removePill(pill: FilterBarPill) {
	justAddedKeys.delete(pill.key);
	if (openPillKey === pill.key) {
		openPillKey = null;
	}
	pill.onRemove?.();
}

function resetPills() {
	justAddedKeys.clear();
	openPillKey = null;
	onReset?.();
}
</script>

<div class="bar">
	{#each visiblePills as pill (pill.key)}
		{@render filterPill(pill)}
	{/each}
	{#if hiddenPills.length > 0}
		{@render addFilterMenu()}
	{/if}
	{#if onReset || actions}
		<div class="actions">
			{#if onReset}
				<Button onclick={resetPills}>
					{#snippet icon()}
						<RotateCcw />
					{/snippet}
					{m.common_actions_reset()}
				</Button>
			{/if}
			{#if actions}{@render actions()}{/if}
		</div>
	{/if}
</div>

{#snippet filterPill(pill: FilterBarPill)}
	<div class="pill">
		<Popover
			isOpen={openPillKey === pill.key}
			onOpenChange={(isOpen) => {
				openPillKey = isOpen ? pill.key : null;
			}}
			popoverClass={["filterPopover", pill.popoverClass]
				.filter(Boolean)
				.join(" ")}
		>
			{#snippet trigger(triggerProps)}
				<button
					type="button"
					class="trigger"
					data-active={pill.formattedValue !== null}
					data-testid={pill.testId}
					{...triggerProps}
				>
					{#if pill.icon}
						<span class="icon">{@render pill.icon()}</span>
					{/if}
					<span>{pill.name}</span>
					{#if pill.formattedValue !== null}
						<span class="value">{pill.formattedValue}</span>
					{/if}
					<ChevronDown class="chevron" />
				</button>
			{/snippet}
			{@render pill.popover()}
		</Popover>
		{#if pill.onRemove}
			<button
				type="button"
				class="removeButton"
				aria-label={`Remove ${pill.name} filter`}
				data-testid={pill.testId ? `${pill.testId}-remove` : undefined}
				onclick={() => removePill(pill)}
			>
				<X />
			</button>
		{/if}
	</div>
{/snippet}

{#snippet addFilterMenu()}
	<Menu>
		{#snippet trigger(triggerProps)}
			<div class="pill">
				<button
					type="button"
					class="trigger"
					data-testid="add-filter-button"
					{...triggerProps}
				>
					<Plus class="plus" />
					<span>{m.common_filterBar_addFilter()}</span>
				</button>
			</div>
		{/snippet}
		{#each hiddenPills as pill (pill.key)}
			<MenuItem
				icon={pill.icon}
				onAction={() => addPill(pill)}
				testId={pill.testId ? `menu-item-${pill.testId}` : undefined}
			>
				{pill.name}
			</MenuItem>
		{/each}
	</Menu>
{/snippet}

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-1-5);
	}

	.pill {
		display: inline-flex;
		align-items: center;
		height: var(--selector-size);
		border-radius: var(--radius-selector);
		background-color: var(--color-bg-higher);
		transition: background-color 0.15s;

		&:has(.trigger:hover) {
			background-color: var(--color-bg-high);
		}

		& :global(.filterPopover) {
			min-width: 14rem;
		}
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		height: 100%;
		padding: 0 var(--s-2);
		border: none;
		border-radius: inherit;
		background-color: transparent;
		color: var(--color-text);
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		cursor: pointer;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 2px;
		}

		.pill:has(.removeButton) & {
			padding-right: var(--s-1);
		}

		& :global(.chevron),
		& :global(.plus) {
			width: 14px;
			height: 14px;
			color: var(--color-text-high);
		}
	}

	.removeButton {
		display: inline-flex;
		align-items: center;
		height: 100%;
		padding: 0 var(--s-1-5);
		border: none;
		border-radius: inherit;
		background-color: transparent;
		color: var(--color-text-high);
		cursor: pointer;

		& > :global(svg) {
			width: 14px;
			height: 14px;
		}

		&:hover {
			color: var(--color-error);
		}

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 2px;
		}
	}

	.actions {
		display: contents;
	}

	.actions :global {
		button {
			display: inline-flex;
			align-items: center;
			gap: var(--s-1);
			height: var(--selector-size);
			padding: 0 var(--s-2);
			border: var(--border-style-high);
			border-radius: var(--radius-selector);
			background-color: transparent;
			color: var(--color-text-high);
			font-size: var(--font-xs);
			font-weight: var(--weight-semi);
			white-space: nowrap;
			cursor: pointer;
			transition:
				background-color 0.15s,
				color 0.15s;

			&:hover {
				background-color: var(--color-bg-high);
				color: var(--color-text);
			}

			&:focus-visible {
				outline: var(--focus-ring);
				outline-offset: 2px;
			}

			&:disabled {
				cursor: not-allowed;
				opacity: 0.5;
			}

			& .buttonIcon {
				min-width: 14px;
				max-width: 14px;
				margin-inline-end: 0;
			}

			& svg {
				width: 14px;
				min-width: 14px;
				max-width: 14px;
				height: 14px;
				margin-inline-end: 0;
			}
		}
	}

	.icon {
		display: inline-flex;

		& > :global(svg) {
			width: 14px;
			height: 14px;
		}
	}

	.value {
		color: var(--color-text-accent);
	}
</style>
