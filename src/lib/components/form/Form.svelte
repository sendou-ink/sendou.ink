<script lang="ts" generics="T extends z4.$ZodType<object>">
	import type { Snippet } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import * as z4 from 'zod/v4/core';
	import { setContext, tick } from 'svelte';
	import type { RemoteForm } from '@sveltejs/kit';
	import z from 'zod';

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<unknown>;
		schema: T;
		defaultValues?: z4.output<T>;
	}

	let { children, heading, action, schema, defaultValues }: Props = $props();
	const id = $props.id();

	let form: HTMLFormElement;

	let errors = $state<Partial<Record<keyof T, string>>>({});
	let isServerError = $state(false);

	$effect(() => {
		if (!action.result) {
			isServerError = false;
			return;
		}

		// xxx: any
		// xxx: focus first error
		errors = (action.result as any).errors;
		isServerError = true;
		tick().then(() => focusFirstInvalidField());
	});

	function handleBlur(
		event: Event & {
			currentTarget: (EventTarget & HTMLInputElement) | HTMLTextAreaElement;
		},
		fieldName: string
	) {
		// @ts-expect-error xxx: figure out correct Zod types
		const fieldSchema = schema.def.shape[fieldName];
		if (!fieldSchema) return;

		const eventValue = event.currentTarget?.value ?? null;
		const parsed = z.safeParse(fieldSchema, eventValue);

		if (parsed.success && !isServerError) {
			delete errors[fieldName as keyof T];
			return;
		}

		if (parsed.error?.issues[0]) {
			errors[fieldName as keyof T] = parsed.error.issues[0].message;
		}
	}

	function focusFirstInvalidField() {
		const form = document.getElementById(id);
		const invalidElement = form?.querySelector('[aria-invalid="true"]') as HTMLInputElement;

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
