<script lang="ts" generics="T extends z.ZodObject<ZodRawShape>">
	import type { ZodObject, ZodRawShape } from 'zod';
	import type { FormField } from '$lib/form/types';
	import { formRegistry } from '$lib/form/fields';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import WeaponPoolFormField from './WeaponPoolFormField.svelte';
	import DualSelectFormField from './DualSelectFormField.svelte';
	import { formContext } from './context';
	import z from 'zod';

	type Output = z.output<T>;

	interface Props {
		name: keyof Output;
	}

	let { name }: Props = $props();

	const { schema, defaultValues, errors, onblur } = formContext.get();

	let value = $state(defaultValues?.[name as keyof typeof defaultValues]);
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
	<InputFormField bind:value {...commonProps} {...formField} />
{:else if formField.type === 'switch'}
	<SwitchFormField bind:checked={value} {...commonProps} {...formField} />
{:else if formField.type === 'text-area'}
	<TextareaFormField bind:value {...commonProps} {...formField} />
{:else if formField.type === 'select'}
	<SelectFormField bind:value clearable {...commonProps} {...formField} />
{:else if formField.type === 'dual-select'}
	<DualSelectFormField bind:value clearable {...commonProps} {...formField} />
{:else if formField.type === 'weapon-pool'}
	<WeaponPoolFormField bind:value {...commonProps} {...formField} />
{:else}
	<p>Unsupported form field type</p>
{/if}
