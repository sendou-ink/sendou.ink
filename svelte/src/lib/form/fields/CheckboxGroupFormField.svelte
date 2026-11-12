<script lang="ts">
import type { FormFieldItemsWithImage } from "~/form/types";
import { getSendouFormContext, storeOf } from "../form-context.ts";
import { resolveItemLabel } from "../item-labels.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	items: FormFieldItemsWithImage<string>;
	minLength?: number;
	disabled?: boolean;
}

let { name, label, bottomText, items, minLength, disabled }: Props = $props();

const id = $props.id();
const context = getSendouFormContext();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(context, name);

const value = $derived((store.value(name) as string[] | undefined) ?? []);
const error = $derived(store.error(name));
const required = $derived((minLength ?? 0) > 0);
const itemsWithLabels = $derived(
	items.map((item) => ({
		...item,
		resolvedLabel: resolveItemLabel(context, item.label),
	})),
);

function handleChange(itemValue: string, checked: boolean) {
	const newValue = checked
		? [...value, itemValue]
		: value.filter((existing) => existing !== itemValue);
	store.change(name, newValue);
	// the click would otherwise validate the pre-click value and show a stale error
	store.blur(name, newValue);
}
</script>

<FormFieldWrapper {id} {name} {label} {required} {error} {bottomText}>
	<div class="stack sm items-start">
		{#each itemsWithLabels as item (item.value)}
			<div class="stack horizontal sm items-center">
				<input
					type="checkbox"
					id={`${id}-${item.value}`}
					value={item.value}
					checked={value.includes(item.value)}
					onchange={(event) => handleChange(item.value, event.currentTarget.checked)}
					{disabled}
				/>
				<label
					for={`${id}-${item.value}`}
					class="stack horizontal sm items-center mb-0 whitespace-nowrap"
				>
					{#if item.imgSrc}
						<img src={item.imgSrc} width={24} height={24} alt="" />
					{/if}
					{item.resolvedLabel}
				</label>
			</div>
		{/each}
	</div>
</FormFieldWrapper>
