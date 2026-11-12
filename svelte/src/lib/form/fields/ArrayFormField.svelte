<script lang="ts">
import { Plus, Trash } from "@lucide/svelte";
import { isDeepEqual } from "remeda";
import type { Snippet } from "svelte";
import Button from "#lib/components/Button.svelte";
import FormMessage from "#lib/components/FormMessage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getSendouFormContext, storeOf } from "../form-context.ts";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	min?: number;
	max: number;
	itemInitialValue?: unknown;
	disabled?: boolean;
	/** Renders the item at the index, named like `dates[0]`. */
	item: Snippet<[number, string]>;
}

let {
	name,
	label,
	bottomText,
	min = 0,
	max,
	itemInitialValue,
	disabled,
	item,
}: Props = $props();

const context = getSendouFormContext();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(context, name);

const value = $derived((store.value(name) as unknown[] | undefined) ?? []);
const translatedLabel = $derived(context.translate(label));
const translatedError = $derived(context.translate(store.error(name)));
const translatedBottomText = $derived(context.translate(bottomText));

const count = $derived(value.length);
// an empty array still shows one input; the value stays empty until edited
const minVisible = $derived(Math.max(min, 1));
const visibleCount = $derived(Math.max(count, minVisible));

function handleAdd() {
	// pad up to the visible rows first so the added item appears below the placeholder row
	const padded = [...value];
	while (padded.length < visibleCount) {
		padded.push(itemInitialValue);
	}
	store.change(name, [...padded, itemInitialValue]);
}

// an untouched item still equals the template, like the empty-array placeholder
function isPristineItem(arrayItem: unknown) {
	return itemInitialValue === undefined
		? arrayItem === null || arrayItem === undefined || arrayItem === ""
		: isDeepEqual(arrayItem, itemInitialValue);
}

// a single pristine row is the placeholder, so no remove button; a lone edited row stays removable
function canRemoveAt(index: number) {
	return (
		!disabled &&
		count > min &&
		(count > minVisible || !isPristineItem(value[index]))
	);
}

function handleRemoveAt(index: number) {
	const next = value.filter((_, i) => i !== index);
	// a lone pristine row would still fail validation on submit, so collapse to empty
	store.change(name, next.length === 1 && isPristineItem(next[0]) ? [] : next);
}
</script>

<div class="stack md w-full">
	{#if translatedLabel}
		<div class="text-xs font-semi-bold">{translatedLabel}</div>
	{/if}
	{#each { length: visibleCount }, idx}
		<div class="item-row">
			<div class="item-input">{@render item(idx, `${name}[${idx}]`)}</div>
			{#if canRemoveAt(idx)}
				<div class="remove-button-column">
					<!-- same height as the item's label so the button lines up with the input, not the error below it -->
					<span aria-hidden="true" class="label-spacer">
						<!-- svelte-ignore a11y_label_has_associated_control (an invisible spacer) -->
						<label class="spacer-label">&nbsp;</label>
					</span>
					<Button
						aria-label="Remove item"
						size="small"
						variant="minimal-destructive"
						onclick={() => handleRemoveAt(idx)}
						class="remove-button"
						data-testid={`${name}-remove-item-button`}
					>
						{#snippet icon(iconClass)}<Trash class={iconClass} />{/snippet}
					</Button>
				</div>
			{/if}
		</div>
	{/each}
	{#if translatedError}
		<FormMessage type="error">{translatedError}</FormMessage>
	{/if}
	{#if translatedBottomText && !translatedError}
		<FormMessage type="info">{translatedBottomText}</FormMessage>
	{/if}
	<Button
		size="small"
		variant="outlined"
		onclick={handleAdd}
		isDisabled={count >= max || disabled}
		class="m-0-auto"
		data-testid={`${name}-add-item-button`}
	>
		{#snippet icon(iconClass)}<Plus class={iconClass} />{/snippet}
		{m.common_actions_add()}
	</Button>
</div>

<style>
	@layer features {
		.item-row {
			display: flex;
			align-items: flex-start;
			gap: var(--s-2);
			width: 100%;

			&:not(:has(.item-input label)) .label-spacer {
				display: none;
			}
		}

		.item-input {
			flex: 1;
		}

		.remove-button-column {
			display: flex;
			flex-direction: column;

			& :global(.remove-button) {
				height: var(--field-size);
			}
		}

		.label-spacer {
			visibility: hidden;
		}

		.spacer-label {
			font-size: var(--font-xs);
			font-weight: var(--weight-bold);
			margin: 0;
			display: block;
			text-box: trim-start cap alphabetic;
		}
	}
</style>
