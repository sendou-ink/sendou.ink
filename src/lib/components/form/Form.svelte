<script lang="ts" generics="T extends z4.$ZodType<object>">
	import type { RemoteForm } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import { setContext, tick } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { zodErrorsToFormErrors } from '$lib/utils/zod';
	import * as z4 from 'zod/v4/core';
	import z from 'zod';
	import Button from '../buttons/Button.svelte';

	type Output = z4.output<T>;

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<{ errors?: Partial<Record<keyof Output, string>> }>;
		schema: T;
		defaultValues?: Partial<Output>;
	}

	let { children, heading, action, schema, defaultValues }: Props = $props();
	const id = $props.id();

	let form: HTMLFormElement;

	let errors = $state<Partial<Record<keyof Output, string>>>({});

	$effect(() => {
		errors = action.result?.errors ?? {};
		tick().then(() => focusFirstInvalidField());
	});

	function handleBlur() {
		const formData = new FormData(form);
		const data = Object.fromEntries(formData.entries());
		const parsed = z.safeParse(schema, data);

		if (parsed.success) {
			errors = {};
			return;
		}

		errors = zodErrorsToFormErrors(parsed.error);
	}

	function focusFirstInvalidField() {
		const invalidElement = form.querySelector('[aria-invalid="true"]') as HTMLInputElement;

		invalidElement?.focus();
		invalidElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	setContext('form', { schema, defaultValues, errors: () => errors, onblur: handleBlur });
</script>

<form {id} bind:this={form} {...action} class="stack md-plus items-start">
	{#if heading}
		<h1 class="text-lg">{heading}</h1>
	{/if}

	{@render children()}

	<div class="stack horizontal lg justify-between mt-6 w-full">
		<Button type="submit" loading={action.pending > 0}>
			{m.common_actions_submit()}
		</Button>
	</div>
</form>
