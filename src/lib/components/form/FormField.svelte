<script lang="ts">
	import type { ZodType, ZodObject, ZodRawShape } from 'zod';
	import type { FormField } from '$lib/form/types';
	import { getContext } from 'svelte';
	import { formRegistry } from '$lib/form/fields';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import WeaponPoolFormField from './WeaponPoolFormField.svelte';
	import DualSelectFormField from './DualSelectFormField.svelte';

	interface FormContext<T extends Record<string, any> = Record<string, any>> {
		schema: ZodType<T>;
		defaultValues?: Partial<T>;
		errors: () => Partial<Record<keyof T, string>>;
		onblur: () => void;
	}

	interface Props {
		name: string;
	}

	let { name }: Props = $props();

	const { schema, defaultValues, errors, onblur } = getContext('form') as FormContext;

	let value = $state(defaultValues?.[name]);
	const error = $derived(errors()[name]);

	const fieldSchema = $derived.by(() => {
		const zodObject = schema as ZodObject<ZodRawShape>;
		const result = zodObject.shape[name];

		if (!result) {
			throw new Error(
				`Field schema not found for name: ${name}. Does the schema have a corresponding key to the name property of FormField?`
			);
		}
		return result;
	});

	const formField = $derived.by(() => {
		const field = formRegistry.get(fieldSchema) as FormField | undefined;

		if (!field) {
			throw new Error(`Form field not found for name: ${name}`);
		}

		return field;
	});

	const commonProps = $derived({ name, error, onblur });
</script>

<!-- xxx: how to differentiate optional and not? -->
<!-- xxx: error message should only be shown if user has interacted with the formfield in question, can we use :user-invalid and :has trickery? -->
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
