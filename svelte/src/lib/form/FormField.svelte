<script lang="ts">
import { getFormFieldMetadata } from "~/form/fields";
import type { BadgeOption, MapPoolFieldOptions, SelectOption } from "~/form/types";
import { getNestedSchema } from "~/form/utils";
import type { AnySyncSchema } from "~/utils/schema";
import ArrayFormField from "./fields/ArrayFormField.svelte";
import BadgesFormField from "./fields/BadgesFormField.svelte";
import CheckboxGroupFormField from "./fields/CheckboxGroupFormField.svelte";
import DatetimeFormField from "./fields/DatetimeFormField.svelte";
import InputFormField from "./fields/InputFormField.svelte";
import MapPoolFormField from "./fields/MapPoolFormField.svelte";
import SelectFormField from "./fields/SelectFormField.svelte";
import TextareaFormField from "./fields/TextareaFormField.svelte";
import FormField from "./FormField.svelte";
import { getSendouFormContext } from "./form-context.ts";

interface Props {
	name: string;
	disabled?: boolean;
	/** Focuses the field on mount. Only `text-field` and `text-area` support it. */
	autofocus?: boolean;
	/** The field's schema when it is not the form schema's entry of `name`, e.g. an array's item. */
	field?: AnySyncSchema;
	/** What the field type needs from the page: select options, badge options, map pool presets. */
	options?: unknown;
}

let { name, disabled, autofocus, field, options }: Props = $props();

const { schema } = getSendouFormContext();

const formField = $derived.by(() => {
	const fieldSchema =
		field ??
		((name.includes(".")
			? getNestedSchema(schema, name)
			: schema.entries[name]) as AnySyncSchema | undefined);
	const metadata = fieldSchema ? getFormFieldMetadata(fieldSchema) : undefined;
	if (!metadata) {
		throw new Error(`No form field metadata for field "${name}"`);
	}

	return metadata;
});

function requireOptions<T>(): T {
	if (!options) {
		throw new Error(`Field "${name}" of type "${formField.type}" requires options`);
	}
	return options as T;
}
</script>

{#if formField.type === "text-field"}
	<InputFormField {...formField} {name} {disabled} {autofocus} />
{:else if formField.type === "text-area"}
	<TextareaFormField {...formField} {name} {disabled} {autofocus} />
{:else if formField.type === "select"}
	<SelectFormField {...formField} {name} {disabled} />
{:else if formField.type === "select-dynamic"}
	<SelectFormField
		{...formField}
		items={requireOptions<SelectOption[]>()}
		{name}
		{disabled}
	/>
{:else if formField.type === "checkbox-group"}
	<CheckboxGroupFormField {...formField} {name} {disabled} />
{:else if formField.type === "datetime"}
	<DatetimeFormField {...formField} {name} {disabled} />
{:else if formField.type === "badges"}
	<BadgesFormField
		{...formField}
		options={requireOptions<BadgeOption[]>()}
		{name}
		{disabled}
	/>
{:else if formField.type === "map-pool"}
	<MapPoolFormField
		{...formField}
		{...options as MapPoolFieldOptions | undefined}
		{name}
		{disabled}
	/>
{:else if formField.type === "array"}
	{@const itemField = formField.field}
	{@const itemMetadata = getFormFieldMetadata(itemField)}
	{#if itemMetadata?.type === "fieldset"}
		{(() => {
			throw new Error(
				`Field "${name}" is an array of fieldsets, which the Svelte slice has not ported yet`,
			);
		})()}
	{/if}
	<ArrayFormField
		{...formField}
		itemInitialValue={itemMetadata?.initialValue}
		{name}
		{disabled}
	>
		{#snippet item(_index, itemName)}
			<FormField name={itemName} field={itemField} {disabled} />
		{/snippet}
	</ArrayFormField>
{:else if formField.type === "hidden"}
	<!-- a value the form carries without a control -->
{:else}
	{(() => {
		throw new Error(
			`Field "${name}" is of type "${formField.type}", which the Svelte slice has not ported yet`,
		);
	})()}
{/if}
