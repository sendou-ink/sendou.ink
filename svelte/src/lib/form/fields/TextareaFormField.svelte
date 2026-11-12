<script lang="ts">
import type { FormFieldProps } from "~/form/types";
import { ariaAttributes } from "~/form/utils";
import { getSendouFormContext, storeOf } from "../form-context.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

type Props = Omit<FormFieldProps<"text-area">, "error" | "onBlur"> & {
	disabled?: boolean;
	autofocus?: boolean;
};

let {
	name,
	label,
	bottomText,
	maxLength,
	required,
	disabled,
	autofocus,
}: Props = $props();

const id = $props.id();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(getSendouFormContext(), name);

const value = $derived((store.value(name) as string | undefined) ?? "");
const error = $derived(store.error(name));
const aria = $derived(ariaAttributes({ name, bottomText, error, required }));

function handleInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
	store.change(name, event.currentTarget.value);
}

function handleBlur() {
	store.blur(name);
}

/** Autofocus leaves the caret before existing text. */
function moveCaretToEnd(element: HTMLTextAreaElement) {
	if (autofocus) {
		element.setSelectionRange(element.value.length, element.value.length);
	}
}
</script>

<FormFieldWrapper
	{id}
	{name}
	{label}
	{required}
	{error}
	{bottomText}
	valueLimits={maxLength ? { current: value.length, max: maxLength } : undefined}
>
	<!-- svelte-ignore a11y_autofocus (opt-in per call site, used for inline edit forms) -->
	<textarea
		{id}
		{@attach moveCaretToEnd}
		{value}
		oninput={handleInput}
		onblur={handleBlur}
		{disabled}
		autocomplete="off"
		{autofocus}
		aria-invalid={aria["aria-invalid"]}
		aria-describedby={aria["aria-describedby"]}
		aria-errormessage={aria["aria-errormessage"]}
		aria-required={aria["aria-required"]}
	></textarea>
</FormFieldWrapper>
