<script lang="ts">
import type { FormFieldItems } from "../form-types.ts";
import { ariaAttributes, translateItemLabel } from "../form-utils.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name?: string;
	label?: string;
	bottomText?: string;
	items: FormFieldItems<string>;
	error?: string;
	onBlur?: (latestValue?: unknown) => void;
	value: string | null;
	onChange: (value: string | null) => void;
	clearable?: boolean;
	disabled?: boolean;
}

let {
	name,
	label,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	clearable,
	disabled,
}: Props = $props();

const id = $props.id();

const itemsWithResolvedLabels = $derived(
	items.map((item) => ({
		value: item.value,
		resolvedLabel: translateItemLabel(item.label),
	})),
);

function handleChange(event: Event & { currentTarget: HTMLSelectElement }) {
	const newValue =
		event.currentTarget.value === "" ? null : event.currentTarget.value;
	onChange(newValue);
}
</script>

<FormFieldWrapper {id} {name} {label} {error} {bottomText}>
	<select
		{id}
		{name}
		value={value ?? ""}
		onchange={handleChange}
		onblur={() => onBlur?.()}
		{disabled}
		{...ariaAttributes({ name, error, bottomText })}
	>
		{#if clearable}<option value="">—</option>{/if}
		{#each itemsWithResolvedLabels as item (item.value)}
			<option value={item.value}>{item.resolvedLabel}</option>
		{/each}
	</select>
</FormFieldWrapper>
