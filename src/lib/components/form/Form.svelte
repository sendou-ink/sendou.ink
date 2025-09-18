<script lang="ts" generics="T extends RemoteFunctionFormSchema">
	import type { RemoteForm } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { formContext } from './context';
	import z from 'zod';
	import Button from '../buttons/Button.svelte';
	import { resolveFieldsByType } from '$lib/utils/form';
	import type {
		RemoteFunctionFormSchema,
		SchemaToDefaultValues
	} from '$lib/server/remote-functions';
	import type { StandardSchemaV1 } from '@standard-schema/spec';

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<
			StandardSchemaV1.InferInput<T>,
			void | { errors: Partial<Record<keyof StandardSchemaV1.InferOutput<T>, string>> }
		>;
		schema: T;
		defaultValues?: Partial<SchemaToDefaultValues<StandardSchemaV1.InferOutput<T>>> | null;
		info?: string;
		/** Fires when the form is succesfully submitted to the server. */
		onSubmit?: () => void;
	}

	let { children, heading, action, schema, defaultValues, info, onSubmit }: Props = $props();
	const id = $props.id();

	let errors = $state<Partial<Record<keyof StandardSchemaV1.InferOutput<T>, string>>>({});
	let form = $state<HTMLFormElement>();

	$inspect(action.issues);

	const containsFileInput = $derived(
		resolveFieldsByType(schema as unknown as z.ZodObject, 'file').length > 0
	);

	formContext.set({
		action,
		defaultValues,
		errors: () => errors,
		onblur: () => action.validate(),
		schema
	});

	// function validateForm() {
	// 	return tick().then(() => {
	// 		const data = new FormData(form);
	// 		// xxx: this is not the best UX because blurring causes all the errors to show up (also those that did have not input yet)
	// 		const parsed = z.safeParse(schema, formDataToObject(data));

	// 		if (action.result?.errors) {
	// 			const formErrors = parsed.success ? {} : zodErrorsToFormErrors(parsed.error);
	// 			errors = { ...formErrors, ...action.result.errors };
	// 			return false;
	// 		}

	// 		if (parsed.success) {
	// 			errors = {};
	// 			return true;
	// 		}

	// 		errors = zodErrorsToFormErrors(parsed.error);
	// 		return false;
	// 	});
	// }

	// function focusFirstInvalid() {
	// 	const form = document.getElementById(id) as HTMLFormElement;

	// 	tick().then(() => {
	// 		const invalidElement = form.querySelector('[aria-invalid="true"]') as HTMLInputElement;

	// 		invalidElement?.focus();
	// 		invalidElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	// 	});
	// }

	// function handleOnchange(event: Event) {
	// 	const target = event.target as (EventTarget & HTMLInputElement) | HTMLTextAreaElement;
	// 	const name = target.name;

	// 	// at least datetime input uses input hidden to hold the actual value so it is not supported for onchange
	// 	if (!name) return;

	// 	const fieldData = new FormData(form).get(name);
	// 	const zodObject = schema as ZodObject<ZodRawShape>;
	// 	const fieldSchema = zodObject.shape[name];

	// 	const parsed = z.safeParse(fieldSchema, fieldData);
	// 	if (!parsed.success) return;

	// 	onchange?.({
	// 		[name]: parsed.data
	// 	} as Partial<Output>);
	// }

	// async function enhanced({ submit }: { submit: () => Promise<void> }) {
	// 	if (!validateForm()) {
	// 		focusFirstInvalid();
	// 		return;
	// 	}

	// 	await submit();
	// 	onSubmit?.();

	// 	errors = action.result?.errors ?? {};
	// 	focusFirstInvalid();
	// }
</script>

<!-- xxx: how to do onSubmit? -->
<form
	bind:this={form}
	{id}
	{...action.preflight(schema)}
	class="stack md-plus items-start"
	enctype={containsFileInput ? 'multipart/form-data' : undefined}
>
	{#if heading || info}
		<div class="stack xs">
			{#if heading}
				<h1 class="text-lg">{heading}</h1>
			{/if}
			{#if info}
				<div class="info-message">
					{info}
				</div>
			{/if}
		</div>
	{/if}

	{@render children()}

	<div class="stack horizontal lg justify-between mt-6 w-full">
		<Button type="submit" loading={action.pending > 0}>
			{m.common_actions_submit()}
		</Button>
	</div>
</form>

<style>
	.info-message {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		text-wrap: balance;
	}
</style>
