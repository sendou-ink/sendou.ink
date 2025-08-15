<script lang="ts" generics="T extends z.ZodObject<ZodRawShape>">
	import type { ZodObject, ZodRawShape } from 'zod';
	import type { FormField } from '$lib/form/types';
	import { formRegistry } from '$lib/form/fields';
	import { formContext } from './context';
	import z from 'zod';
	import WeaponPoolFormField, { type WeaponPool } from './WeaponPoolFormField.svelte';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import DualSelectFormField from './DualSelectFormField.svelte';

	type Output = z.output<T>;
	type ValueType = Output[keyof Output];

	interface Props {
		name: keyof Output;
	}

	let { name }: Props = $props();

	const { schema, defaultValues, errors, onblur } = formContext.get();

	let value = $state(defaultValues?.[name as keyof typeof defaultValues] as ValueType);
	const error = $derived(errors()[name as keyof typeof errors]);

	const fieldSchema = $derived.by(() => {
		const zodObject = schema as ZodObject<ZodRawShape>;
		const result = zodObject.shape[name as string];

		if (!result) {
			throw new Error(
				`Field schema not found for name: ${String(name)}. Does the schema have a corresponding key to the name property of FormField?`
			);
		}
		return result;
	});

	const formField = $derived.by(() => {
		const field = formRegistry.get(fieldSchema) as FormField | undefined;

		if (!field) {
			throw new Error(`Form field not found for name: ${String(name)}`);
		}

		return field;
	});

	const commonProps = $derived({ name: name as string, error, onblur });
</script>

{#if formField.type === 'text-field'}
	<InputFormField bind:value={value as string} {...commonProps} {...formField} />
{:else if formField.type === 'switch'}
	<SwitchFormField bind:checked={value as boolean} {...commonProps} {...formField} />
{:else if formField.type === 'text-area'}
	<TextareaFormField bind:value={value as string} {...commonProps} {...formField} />
{:else if formField.type === 'select'}
	<SelectFormField bind:value={value as string} clearable {...commonProps} {...formField} />
{:else if formField.type === 'dual-select'}
	<DualSelectFormField
		bind:value={value as [string, string]}
		clearable
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'weapon-pool'}
	<WeaponPoolFormField bind:value={value as WeaponPool[]} {...commonProps} {...formField} />
{:else}
	<p>Unsupported form field type</p>
{/if}
