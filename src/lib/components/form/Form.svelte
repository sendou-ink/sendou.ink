<script lang="ts" generics="T extends z4.$ZodType<object>">
	import type { Snippet } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import * as z4 from 'zod/v4/core';
	import { setContext, tick } from 'svelte';
	import type { RemoteForm } from '@sveltejs/kit';
	import z from 'zod';

	type Output = z4.output<T>;

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<unknown>;
		schema: T;
		defaultValues?: Output;
	}

	let { children, heading, action, schema, defaultValues }: Props = $props();
	const id = $props.id();

	let form: HTMLFormElement;

	let errors = $state<Partial<Record<keyof Output, string>>>({});

	$effect(() => {
		errors =
			(action.result as { errors?: Partial<Record<keyof Output, string>> } | null)?.errors ?? {};
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

		const newErrors: Partial<Record<keyof Output, string>> = {};

		for (const issue of parsed.error.issues) {
			if (issue.path.length !== 1) throw new Error('Not implemented');
			newErrors[issue.path[0] as keyof Output] = issue.message as string;
		}

		errors = newErrors;
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
