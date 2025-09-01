<script lang="ts">
	import type { ZodObject, ZodRawShape } from 'zod';
	import type { FormField } from '$lib/form/types';
	import { formRegistry } from '$lib/form/fields';
	import { formContext, type FormContextValue } from './context';
	import WeaponPoolFormField, { type WeaponPool } from './WeaponPoolFormField.svelte';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import DualSelectFormField from './DualSelectFormField.svelte';
	import type { Snippet } from 'svelte';
	import InputGroupFormField from './InputGroupFormField.svelte';
	import MapPoolFormField from './MapPoolFormField.svelte';
	import type { ModeShort } from '$lib/constants/in-game/types';
	import MultiSelectFormField from './MultiSelectFormField.svelte';
	import ImageFormField from '$lib/components/form/ImageFormField.svelte';
	import * as MapPool from '$lib/core/maps/MapPool';
	import { resolveDefaultValue } from '$lib/form/utils';
	import DatetimeFormField from './DatetimeFormField.svelte';
	import ArrayFormField from './ArrayFormField.svelte';

	interface Props {
		/** Name of the form field, should correspond to a key in the form schema if `field` was not provided. */
		name: string;
		/** The zod object containing form registry information. Used for array form fields. */
		field?: ZodObject<ZodRawShape>;
		label?: string;
		/** For map pool form field, what modes to pick for? */
		modes?: ModeShort[];
		children?: Snippet<
			[
				{
					label?: string;
					onblur: FormContextValue['onblur'];
					error: string | undefined;
					name: string;
					data: { value: unknown };
				}
			]
		>;
	}

	let { name, children, modes, field, label }: Props = $props();

	const { schema, defaultValues, errors, onblur } = formContext.get();

	const fieldSchema = (() => {
		if (field) return field;

		const zodObject = schema as ZodObject<ZodRawShape>;
		const result = zodObject.shape[name as string];

		if (!result) {
			throw new Error(
				`Field schema not found for name: ${String(name)}. Does the schema have a corresponding key to the name property of FormField?`
			);
		}
		return result;
	})();

	const formField = (() => {
		const result = formRegistry.get(fieldSchema) as FormField | undefined;

		if (!result) {
			throw new Error(`Form field not found for name: ${String(name)}`);
		}

		return label ? { ...result, label } : result;
	})();

	let data = $state({
		value: resolveDefaultValue({
			defaultValues,
			field: formField,
			name
		})
	});
	const error = $derived<string | undefined>(errors()[name as keyof typeof errors]);

	const commonProps = $derived({ name, error, onblur });
</script>

{#if formField.type === 'text-field'}
	<InputFormField bind:value={data.value as string} {...commonProps} {...formField} />
{:else if formField.type === 'switch'}
	<SwitchFormField bind:checked={data.value as boolean} {...commonProps} {...formField} />
{:else if formField.type === 'text-area'}
	<TextareaFormField bind:value={data.value as string} {...commonProps} {...formField} />
{:else if formField.type === 'select'}
	<SelectFormField bind:value={data.value as string} clearable {...commonProps} {...formField} />
{:else if formField.type === 'dual-select'}
	<DualSelectFormField
		bind:value={data.value as [string, string]}
		clearable
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'multi-select'}
	<MultiSelectFormField bind:value={data.value as string[]} {...commonProps} {...formField} />
{:else if formField.type === 'radio-group'}
	<InputGroupFormField
		inputType="radio"
		bind:value={data.value as string}
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'checkbox-group'}
	<InputGroupFormField
		inputType="checkbox"
		bind:value={data.value as string[]}
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'datetime'}
	<DatetimeFormField bind:value={data.value as Date} {...commonProps} {...formField} />
{:else if formField.type === 'weapon-pool'}
	<WeaponPoolFormField bind:value={data.value as WeaponPool[]} {...commonProps} {...formField} />
{:else if formField.type === 'map-pool'}
	<MapPoolFormField
		bind:value={data.value as MapPool.MapPool}
		{modes}
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'custom'}
	{@render children?.({ data, ...commonProps, ...formField })}
{:else if formField.type === 'image'}
	<ImageFormField bind:value={data.value as File} {...commonProps} {...formField} />
{:else if formField.type === 'string-constant'}
	<input type="hidden" {name} value={data.value} />
{:else if formField.type === 'id-constant'}
	<input type="hidden" {name} value={data.value} />
{:else if formField.type === 'array'}
	<ArrayFormField bind:value={data.value as string[]} {...commonProps} {...formField} />
{:else}
	<p>Unsupported form field type</p>
{/if}
