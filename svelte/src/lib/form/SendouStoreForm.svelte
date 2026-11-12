<!--
	A schema form whose values live in a client-side store (`FormStore`), the way the React `SendouForm` keeps
	them: for forms whose values aren't flat form data (arrays, dates, map pools). Fixed-field forms use the
	remote form backed `SendouForm` instead.
-->
<script lang="ts">
import type { Snippet } from "svelte";
import type { FormObjectSchema } from "~/form/types";
import Button from "#lib/components/Button.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { setSendouFormContext } from "./form-context.ts";
import { FormStore } from "./form-store.svelte.ts";
import { loadFormsMessages, translateFormText } from "./forms-messages.ts";

interface Props {
	schema: FormObjectSchema;
	/** Read once, on mount. */
	defaultValues?: Record<string, unknown>;
	/** Called with the values once a submit passes validation. */
	onSubmit: (values: Record<string, unknown>) => void;
	children: Snippet;
	submitButtonText?: string;
	submitButtonTestId?: string;
	/** Opts out of the default centered max-width layout to fill the parent. */
	fullWidth?: boolean;
}

let {
	schema,
	defaultValues,
	onSubmit,
	children,
	submitButtonText,
	submitButtonTestId = "submit-button",
	fullWidth,
}: Props = $props();

let messages = $state.raw<Record<string, string>>({});

// svelte-ignore state_referenced_locally (a form's schema and default values are read once, on mount)
const store = new FormStore(schema, defaultValues);

// svelte-ignore state_referenced_locally
setSendouFormContext({
	store,
	schema,
	translate: (text) => translateFormText(messages, text),
});
// context has to be set before the first await
messages = await loadFormsMessages(getLocale());

async function handleSubmit(event: SubmitEvent) {
	event.preventDefault();

	if (await store.validateForSubmit()) onSubmit(store.values);
}
</script>

<form
	method="post"
	class={["form", fullWidth && "full-width"]}
	novalidate
	onsubmit={handleSubmit}
>
	{@render children()}
	<div class="mt-4 stack horizontal md mx-auto justify-center items-center">
		<Button type="submit" testId={submitButtonTestId} data-form-submit="">
			{submitButtonText ?? m.forms_submit()}
		</Button>
	</div>
</form>

<style>
	@layer features {
		.form {
			display: flex;
			flex-direction: column;
			gap: var(--s-6);
			width: 100%;
			max-width: 24rem;
			margin: 0 auto;

			&.full-width {
				margin: 0;
				max-width: none;
			}
		}
	}
</style>
