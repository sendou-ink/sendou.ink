<script lang="ts">
	import { formRegistry } from '$lib/form/fields';
	import type { FormField } from '$lib/form/types';
	import { getContext } from 'svelte';
	import type z from 'zod';
	import InputFormField from './InputFormField.svelte';
	import SwitchFormField from './SwitchFormField.svelte';
	import TextareaFormField from './TextareaFormField.svelte';

	interface Props {
		name: string;
	}

	let { name }: Props = $props();

	const { schema, defaultValues, errors } = getContext('form') as {
		schema: z.ZodType<z.ZodObject>;
		defaultValues?: any;
		errors: any;
	};

	const defaultValue = $derived(defaultValues?.[name]);
	const error = $derived(errors[name]);

	if (!schema) {
		throw new Error('Missing schema in context');
	}

	const formField = $derived.by(() => {
		// @ts-expect-error TODO: figure out correct Zod types
		const field = formRegistry.get(schema.def.shape[name]) as FormField | undefined;

		if (!field) {
			throw new Error(`Form field not found for name: ${name}`);
		}

		return field;
	});
</script>

{#if formField.type === 'text-field'}
	<InputFormField {name} value={defaultValue} {error} {...formField} />
{:else if formField.type === 'toggle'}
	<SwitchFormField {name} checked={defaultValue} {error} {...formField} />
{:else if formField.type === 'text-area'}
	<TextareaFormField {name} value={defaultValue} {error} {...formField} />
{:else}
	<p>Unsupported form field type</p>
{/if}
