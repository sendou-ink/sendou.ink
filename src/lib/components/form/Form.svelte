<script lang="ts" generics="T extends z4.$ZodType<object>">
	import type { Snippet } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import * as z4 from 'zod/v4/core';
	import { setContext } from 'svelte';
	import type { RemoteForm } from '@sveltejs/kit';

	interface Props {
		children: Snippet;
		heading?: string;
		action: RemoteForm<unknown>;
		schema: T;
		defaultValues?: z4.output<T>;
	}

	let { children, heading, action, schema, defaultValues }: Props = $props();

	setContext('form', { schema, defaultValues });
</script>

<form {...action} class="stack md-plus items-start">
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
