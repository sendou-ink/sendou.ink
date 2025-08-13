<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import type z from 'zod';
	import { setContext } from 'svelte';

	interface Props {
		children: Snippet;
		heading?: string;
		action: any; // xxx: type this
		schema: z.ZodType<unknown>;
	}

	let { children, heading, action, schema }: Props = $props();

	setContext('form', { schema });
</script>

<form {...action} class="stack md-plus items-start">
	{#if heading}
		<h1 class="text-lg">{heading}</h1>
	{/if}

	{@render children()}

	<div class="stack horizontal lg justify-between mt-6 w-full">
		<Button>
			{m.common_actions_submit()}
		</Button>
		<!-- {cancelLink ? (
						<LinkButton
							variant="minimal-destructive"
							to={cancelLink}
							size="small"
						>
							{t("common:actions.cancel")}
						</LinkButton>
					) : null} -->
	</div>
</form>
