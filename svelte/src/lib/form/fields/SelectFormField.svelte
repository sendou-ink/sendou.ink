<script lang="ts">
import type { FormFieldItems } from "~/form/types";
import { ariaAttributes } from "~/form/utils";
import { getSendouFormContext, storeOf } from "../form-context.ts";
import { resolveItemLabel } from "../item-labels.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	items: FormFieldItems<string>;
	clearable?: boolean;
	searchable?: boolean;
	disabled?: boolean;
}

let {
	name,
	label,
	bottomText,
	items,
	clearable,
	searchable,
	disabled,
}: Props = $props();

const id = $props.id();
const context = getSendouFormContext();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(context, name);

const value = $derived(store.value(name) as string | null | undefined);
const error = $derived(store.error(name));
const aria = $derived(ariaAttributes({ name, error, bottomText }));

const groups = $derived(
	groupConsecutive(
		items.map((item) => ({
			value: item.value,
			resolvedLabel: resolveItemLabel(context, item.label),
			group: item.group ? resolveItemLabel(context, item.group) : undefined,
		})),
	),
);

// svelte-ignore state_referenced_locally (a field's items are fixed for its lifetime)
if (searchable || items.some((item) => item.description)) {
	throw new Error(
		`Select "${name}" needs the searchable select, which the Svelte slice has not ported yet`,
	);
}

function handleChange(event: Event & { currentTarget: HTMLSelectElement }) {
	const newValue = event.currentTarget.value;
	store.change(name, newValue === "" ? null : newValue);
}

function handleBlur() {
	store.blur(name);
}

function groupConsecutive<T extends { group?: string }>(entries: T[]) {
	const result: Array<{ group?: string; items: T[] }> = [];
	for (const entry of entries) {
		const last = result.at(-1);
		if (last && last.group === entry.group) {
			last.items.push(entry);
		} else {
			result.push({ group: entry.group, items: [entry] });
		}
	}
	return result;
}
</script>

<FormFieldWrapper {id} {name} {label} {error} {bottomText}>
	<select
		{id}
		{name}
		value={value ?? ""}
		onchange={handleChange}
		onblur={handleBlur}
		{disabled}
		aria-invalid={aria["aria-invalid"]}
		aria-describedby={aria["aria-describedby"]}
		aria-errormessage={aria["aria-errormessage"]}
	>
		{#if clearable}<option value="">—</option>{/if}
		{#each groups as groupOfItems (groupOfItems.group ?? groupOfItems.items[0]?.value)}
			{#if groupOfItems.group}
				<optgroup label={groupOfItems.group}>
					<legend class="group-label">{groupOfItems.group}</legend>
					{#each groupOfItems.items as item (item.value)}
						<option value={item.value}>{item.resolvedLabel}</option>
					{/each}
				</optgroup>
			{:else}
				{#each groupOfItems.items as item (item.value)}
					<option value={item.value}>{item.resolvedLabel}</option>
				{/each}
			{/if}
		{/each}
	</select>
</FormFieldWrapper>

<style>
	@layer features {
		.group-label {
			font-size: var(--font-xs);
			font-weight: var(--weight-semi);
			color: var(--color-text-high);
		}
	}
</style>
