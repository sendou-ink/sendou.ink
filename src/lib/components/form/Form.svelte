<script lang="ts" generics="T extends z.ZodObject<ZodRawShape>">
	import type { RemoteForm } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { zodErrorsToFormErrors } from '$lib/utils/zod';
	import { formContext } from './context';
	import z, { ZodObject, type ZodRawShape } from 'zod';
	import Button from '../buttons/Button.svelte';

	type Output = z.output<T>;

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<void | { errors: Partial<Record<keyof Output, string>> }>;
		schema: T;
		defaultValues?: Partial<Output>;
		info?: string;
		/** Fires when the form changes and the resulting data is considered valid as defined by the given schema. Note: only works for "primitive" fields such as plain inputs, selects and input groups.*/
		onchange?: (data: Partial<Output>) => void;
	}

	let { children, heading, action, schema, defaultValues, info, onchange }: Props = $props();
	const id = $props.id();

	let errors = $state<Partial<Record<keyof Output, string>>>({});

	formContext.set({
		schema,
		defaultValues,
		errors: () => errors,
		onblur: () => validateForm()
	});

	function formElement() {
		// TODO: at the time of the writing form with reference did not play together nicely remote functions, convert to ref later
		return document.getElementById(id) as HTMLFormElement;
	}

	function validateForm() {
		return tick().then(() => {
			const data = new FormData(formElement());
			// @ts-expect-error
			const parsed = z.safeParse(schema, Object.fromEntries(data.entries()));

			if (action.result?.errors) {
				const formErrors = parsed.success ? {} : zodErrorsToFormErrors(parsed.error);
				errors = { ...formErrors, ...action.result.errors };
				return false;
			}

			if (parsed.success) {
				errors = {};
				return true;
			}

			errors = zodErrorsToFormErrors(parsed.error);
			return false;
		});
	}

	function focusFirstInvalid() {
		const form = document.getElementById(id) as HTMLFormElement;

		tick().then(() => {
			const invalidElement = form.querySelector('[aria-invalid="true"]') as HTMLInputElement;

			invalidElement?.focus();
			invalidElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	function handleOnchange(event: Event) {
		const target = event.currentTarget as (EventTarget & HTMLInputElement) | HTMLTextAreaElement;
		const name = target.name;

		const fieldData = new FormData(formElement()).getAll(name);
		const zodObject = schema as ZodObject<ZodRawShape>;
		const fieldSchema = zodObject.shape[name];

		const parsed = z.safeParse(fieldSchema, fieldData);
		if (!parsed.success) return;

		onchange?.({
			[name]: parsed.data
		} as Partial<Output>);
	}

	async function enhanced({ submit }: { submit: () => Promise<void> }) {
		if (!validateForm()) {
			focusFirstInvalid();
			return;
		}

		await submit();
		errors = action.result?.errors ?? {};
		focusFirstInvalid();
	}
</script>

<form
	{id}
	{...action.enhance(enhanced)}
	class="stack md-plus items-start"
	onchange={onchange ? handleOnchange : undefined}
>
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
