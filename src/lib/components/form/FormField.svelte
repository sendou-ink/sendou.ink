<script lang="ts">
	import { formRegistry } from '$lib/form/fields';
	import type { FormField } from '$lib/form/types';
	import { getContext } from 'svelte';
	import type z from 'zod';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';
	import SelectFormField from './SelectFormField.svelte';

	interface Props {
		name: string;
	}

	let { name }: Props = $props();

	const { schema, defaultValues, errors, onblur } = getContext('form') as {
		schema: z.ZodType<z.ZodObject>;
		defaultValues?: any; // xxx: fix anys
		errors: any;
		onblur: any;
	};

	const defaultValue = $derived(defaultValues?.[name]);
	const error = $derived(errors()[name]);

	const fieldSchema = $derived.by(() => {
		// @ts-expect-error TODO: figure out correct Zod types
		const result = schema.def.shape[name];
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

	const commonProps = $derived({ name, error });
</script>

<!-- xxx: how to differentiate optional and not? -->
{#if formField.type === 'text-field'}
	<InputFormField
		value={defaultValue}
		onblur={(e) => onblur(e, name)}
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'switch'}
	<SwitchFormField checked={defaultValue} {...commonProps} {...formField} />
{:else if formField.type === 'text-area'}
	<TextareaFormField
		value={defaultValue}
		onblur={(e) => onblur(e, name)}
		{...commonProps}
		{...formField}
	/>
{:else if formField.type === 'select'}
	<SelectFormField
		value={defaultValue}
		onblur={(e) => onblur(e, name)}
		clearable
		{...commonProps}
		{...formField}
	/>
{:else}
	<p>Unsupported form field type</p>
{/if}
