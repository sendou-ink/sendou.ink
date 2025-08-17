<script lang="ts" generics="T extends z.ZodObject<ZodRawShape>">
	import type { ZodObject, ZodRawShape } from 'zod';
	import type { FormField } from '$lib/form/types';
	import { formRegistry } from '$lib/form/fields';
	import { formContext, type FormContextValue } from './context';
	import z from 'zod';
	import WeaponPoolFormField, { type WeaponPool } from './WeaponPoolFormField.svelte';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import DualSelectFormField from './DualSelectFormField.svelte';
	import type { Snippet } from 'svelte';

	type Output = z.output<T>;
	type ValueType = Output[keyof Output];

	interface Props {
		name: string;
		children?: Snippet<
			[
				{
					label: string;
					onblur: FormContextValue['onblur'];
					error: never;
					name: string;
					data: { value: unknown };
				}
			]
		>;
	}

	let { name, children }: Props = $props();

	const { schema, defaultValues, errors, onblur } = formContext.get();

	let data = $state({ value: defaultValues?.[name as keyof typeof defaultValues] as ValueType });
	const error = $derived(errors()[name as keyof typeof errors]);

	const fieldSchema = (() => {
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
		const field = formRegistry.get(fieldSchema) as FormField | undefined;

		if (!field) {
			throw new Error(`Form field not found for name: ${String(name)}`);
		}

		return field;
	})();

	const commonProps = $derived({ name, error, onblur }); // xxx: error is of type never
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
{:else if formField.type === 'weapon-pool'}
	<WeaponPoolFormField bind:value={data.value as WeaponPool[]} {...commonProps} {...formField} />
{:else if formField.type === 'custom'}
	{@render children?.({ data, ...commonProps, ...formField })}
{:else}
	<p>Unsupported form field type</p>
{/if}
