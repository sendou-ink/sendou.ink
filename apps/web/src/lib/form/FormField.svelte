<script lang="ts">
import type { Snippet } from "svelte";
import type { StageId } from "@sendou/in-game-lists/types";
import { getFormFieldMetadata } from "./fields.ts";
import DatetimeFormField from "./fields/DatetimeFormField.svelte";
import DualSelectFormField from "./fields/DualSelectFormField.svelte";
import InputFormField from "./fields/InputFormField.svelte";
import RadioGroupFormField from "./fields/RadioGroupFormField.svelte";
import SelectFormField from "./fields/SelectFormField.svelte";
import StageSelectFormField from "./fields/StageSelectFormField.svelte";
import SwitchFormField from "./fields/SwitchFormField.svelte";
import TextareaFormField from "./fields/TextareaFormField.svelte";
import TimeRangeFormField from "./fields/TimeRangeFormField.svelte";
import TournamentSearchFormField from "./fields/TournamentSearchFormField.svelte";
import { getFormContext } from "./form-context.ts";
import type {
	CustomFieldRenderProps,
	FormField as FormFieldType,
	FormFieldItems,
	FormFieldItemsWithImage,
	SelectOption,
} from "./form-types.ts";
import { objectEntries } from "./form-utils.ts";

interface Props {
	name: string;
	label?: string;
	/** Extra element rendered next to the label. Only `text-field` supports it. */
	labelPopover?: Snippet;
	disabled?: boolean;
	/** Focuses the field on mount. Only `text-field` and `text-area` support it. */
	autoFocus?: boolean;
	/** Field-specific options (items for dynamic selects/radio groups, etc.) */
	options?: unknown;
	/**
	 * Runs after the new value has been stored. For side effects on other
	 * fields; to change what gets stored use the field schema's own options.
	 */
	onValueChange?: (newValue: unknown) => void;
	/** Render snippet for `custom` fields. */
	children?: Snippet<[CustomFieldRenderProps]>;
}

let {
	name,
	label,
	labelPopover,
	disabled,
	autoFocus,
	options,
	onValueChange,
	children,
}: Props = $props();

const context = getFormContext();

const isDisabled = $derived(disabled ?? context.readOnly);

const fieldSchema = $derived.by(() => {
	const result = objectEntries(context.schema)[name];
	if (!result) {
		throw new Error(
			`Field schema not found for name: ${name}. Does the schema have a corresponding key?`,
		);
	}
	return result;
});

const formField = $derived.by(() => {
	const result = getFormFieldMetadata(fieldSchema);
	if (!result) {
		throw new Error(`Form field metadata not found for name: ${name}`);
	}
	return (label ? { ...result, label } : result) as FormFieldType;
});

const value = $derived(context.value(name) ?? formField.initialValue);
const displayedError = $derived(context.displayedError(name));

function handleChange(newValue: unknown) {
	context.setValue(name, newValue);
	onValueChange?.(newValue);
}

function requiredOptions<T>(): T {
	if (!options) {
		throw new Error(`Form field "${name}" requires an options prop`);
	}
	return options as T;
}

function handleBlur(latestValue?: unknown) {
	context.handleBlur(name, latestValue);
}
</script>

{#if formField.type === "text-field"}
	<InputFormField
		{name}
		label={formField.label}
		{labelPopover}
		bottomText={formField.bottomText}
		leftAddon={formField.leftAddon}
		transformValue={formField.transformValue}
		placeholder={formField.placeholder}
		maxLength={formField.maxLength}
		error={displayedError}
		onBlur={handleBlur}
		required={formField.required}
		inputType={formField.inputType}
		disabled={isDisabled}
		{autoFocus}
		value={value as string}
		onChange={handleChange}
	/>
{:else if formField.type === "text-area"}
	<TextareaFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		maxLength={formField.maxLength}
		error={displayedError}
		onBlur={handleBlur}
		required={formField.required}
		disabled={isDisabled}
		{autoFocus}
		value={value as string}
		onChange={handleChange}
	/>
{:else if formField.type === "switch"}
	<SwitchFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		error={displayedError}
		checked={value as boolean}
		onChange={handleChange}
		isDisabled={isDisabled}
	/>
{:else if formField.type === "select"}
	<SelectFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		items={formField.items}
		error={displayedError}
		onBlur={handleBlur}
		value={value as string | null}
		onChange={handleChange}
		clearable={formField.clearable}
		disabled={isDisabled}
	/>
{:else if formField.type === "select-dynamic"}
	<SelectFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		items={requiredOptions<SelectOption[]>().map((option) => ({
			value: option.value,
			label: option.label,
		}))}
		error={displayedError}
		onBlur={handleBlur}
		value={value as string | null}
		onChange={handleChange}
		clearable={formField.clearable}
		disabled={isDisabled}
	/>
{:else if formField.type === "dual-select"}
	<DualSelectFormField
		{name}
		bottomText={formField.bottomText}
		error={displayedError}
		onBlur={handleBlur}
		fields={formField.fields as [
			{ label?: string; items: FormFieldItems<string> },
			{ label?: string; items: FormFieldItems<string> },
		]}
		value={value as [string | null, string | null]}
		onChange={handleChange}
		disabled={isDisabled}
	/>
{:else if formField.type === "radio-group-dynamic"}
	<RadioGroupFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		items={requiredOptions<FormFieldItemsWithImage<string>>()}
		error={displayedError}
		onBlur={handleBlur}
		value={value as string | null}
		onChange={handleChange}
		minLength={formField.minLength}
		disabled={isDisabled}
	/>
{:else if formField.type === "datetime" || formField.type === "date"}
	<DatetimeFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		error={displayedError}
		required={formField.required}
		onBlur={handleBlur}
		granularity={formField.type === "date" ? "day" : "minute"}
		value={value as Date | undefined}
		onChange={handleChange}
		disabled={isDisabled}
	/>
{:else if formField.type === "time-range"}
	<TimeRangeFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		startLabel={formField.startLabel}
		endLabel={formField.endLabel}
		error={displayedError}
		onBlur={handleBlur}
		value={value as { start: string; end: string } | null}
		onChange={handleChange}
		disabled={isDisabled}
	/>
{:else if formField.type === "tournament-search"}
	<TournamentSearchFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		error={displayedError}
		required={formField.required}
		onBlur={handleBlur}
		value={value as number | null}
		onChange={handleChange}
		disabled={isDisabled}
	/>
{:else if formField.type === "stage-select"}
	<StageSelectFormField
		{name}
		label={formField.label}
		bottomText={formField.bottomText}
		error={displayedError}
		required={formField.required}
		onBlur={handleBlur}
		value={value as StageId | null}
		onChange={handleChange}
		disabled={isDisabled}
	/>
{:else if formField.type === "custom"}
	{#if !children}
		{(() => {
			throw new Error("Custom form field requires a children snippet");
		})()}
	{/if}
	{@render children?.({
		name,
		error: displayedError,
		value,
		onChange: handleChange,
		disabled: isDisabled,
	})}
{:else if formField.type === "hidden"}
	<!-- renders no control; the value is seeded from initialValue/defaultValues -->
{:else}
	<div>Unsupported form field type: {(formField as FormFieldType).type}</div>
{/if}
