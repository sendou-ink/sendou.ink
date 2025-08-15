<script lang="ts" generics="T extends z.ZodType<object>">
	import type { RemoteForm } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { zodErrorsToFormErrors } from '$lib/utils/zod';
	import { formContext } from './context';
	import z from 'zod';
	import Button from '../buttons/Button.svelte';

	type Output = z.output<T>;

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<void | { errors: Partial<Record<keyof Output, string>> }>;
		schema: T;
		defaultValues?: Partial<Output>;
	}

	let { children, heading, action, schema, defaultValues }: Props = $props();
	const id = $props.id();

	let form: HTMLFormElement;
	let errors = $state<Partial<Record<keyof Output, string>>>({});

	formContext.set({
		schema,
		defaultValues,
		errors: () => errors,
		onblur: () => validateForm(new FormData(form))
	});

	function validateForm(data: FormData) {
		const parsed = z.safeParse(schema, Object.fromEntries(data.entries()));
		if (parsed.success) {
			errors = {};
			return true;
		}

		errors = zodErrorsToFormErrors(parsed.error);
		return false;
	}

	function focusFirstInvalid() {
		tick().then(() => {
			const invalidElement = form.querySelector('[aria-invalid="true"]') as HTMLInputElement;

			invalidElement?.focus();
			invalidElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	async function enhanced({ data, submit }: { data: FormData; submit: () => Promise<void> }) {
		if (!validateForm(data)) {
			focusFirstInvalid();
			return;
		}

		await submit();
		errors = action.result?.errors ?? {};
		focusFirstInvalid();
	}
</script>

<form {id} bind:this={form} {...action.enhance(enhanced)} class="stack md-plus items-start">
	{#if heading}
		<h1 class="text-lg">{heading}</h1>
	{/if}

	{@render children()}

	<div class="stack horizontal lg justify-between mt-6 w-full">
		<Button type="submit" loading={action.pending > 0} disabled={Object.keys(errors).length > 0}>
			{m.common_actions_submit()}
		</Button>
	</div>
</form>
