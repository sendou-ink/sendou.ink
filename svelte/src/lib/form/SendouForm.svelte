<script lang="ts" generics="Input extends RemoteFormInput">
import { type Snippet, tick } from "svelte";
import type { RemoteForm, RemoteFormInput } from "$app/server";
import type { FormObjectSchema } from "~/form/types";
import Button from "#lib/components/Button.svelte";
import FormMessage from "#lib/components/FormMessage.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { trackMutation } from "#lib/pending-mutations.svelte.ts";
import { setSendouFormContext } from "./form-context.ts";
import { loadFormsMessages, translateFormText } from "./forms-messages.ts";
import { remoteFormSchema } from "./remote-form-schema.ts";

interface Props {
	/** Remote `form()` validating with `remoteFormSchema(schema)`. */
	form: Omit<RemoteForm<Input, unknown>, "for">;
	/** Renders the fields and validates them before submitting. */
	schema: FormObjectSchema;
	children: Snippet;
	submitButtonText?: string;
	submitButtonTestId?: string;
}

let {
	form,
	schema,
	children,
	submitButtonText,
	submitButtonTestId = "submit-button",
}: Props = $props();

let messages = $state.raw<Record<string, string>>({});
let fallbackError = $state<string | null>(null);

// svelte-ignore state_referenced_locally (a form's remote function and schema are read once, on mount)
const enhanced = form
	.preflight(remoteFormSchema(schema))
	.enhance(async (submission) => {
		fallbackError = null;
		try {
			await trackMutation(() => submission.submit());
		} catch {
			fallbackError = "Something went wrong";
			return;
		}
		await focusFirstInvalidField(submission.element);
	});

// svelte-ignore state_referenced_locally
setSendouFormContext({
	form: form as Omit<RemoteForm<any, unknown>, "for">,
	schema,
	translate: (text) => translateFormText(messages, text),
});
// context has to be set before the first await
messages = await loadFormsMessages(getLocale());

const formIssues = $derived(form.fields.issues());

// runs before the remote form's own submit handler, which validates the same way but moves no focus
async function handleSubmit(
	event: SubmitEvent & { currentTarget: HTMLFormElement },
) {
	const formElement = event.currentTarget;
	await form.validate({ all: true, preflightOnly: true });
	await focusFirstInvalidField(formElement);
}

// the remote form only validates as it is submitted: this shows a field's issues once it has been edited and left
function validateTouchedFields() {
	void form.validate({ preflightOnly: true });
}

async function focusFirstInvalidField(formElement: HTMLFormElement) {
	await tick();
	formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
</script>

<form
	{...enhanced}
	class="form"
	novalidate
	onsubmit={handleSubmit}
	oninput={validateTouchedFields}
	onfocusout={validateTouchedFields}
>
	{@render children()}
	<div class="mt-4 stack horizontal md mx-auto justify-center items-center">
		<Button
			type="submit"
			testId={submitButtonTestId}
			isPending={form.pending > 0}
			data-form-submit=""
		>
			{submitButtonText ?? m.forms_submit()}
		</Button>
	</div>
	{#each formIssues ?? [] as issue (issue.message)}
		<FormMessage type="error">
			{translateFormText(messages, issue.message)}
		</FormMessage>
	{/each}
	{#if fallbackError}
		<div class="mt-4 mx-auto" data-testid="fallback-form-error">
			<FormMessage type="error">{fallbackError}</FormMessage>
		</div>
	{/if}
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
		}
	}
</style>
