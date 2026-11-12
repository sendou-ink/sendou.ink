<script lang="ts">
import { format, isValid, parse } from "date-fns";
import type { FormFieldProps } from "~/form/types";
import { ariaAttributes } from "~/form/utils";
import { getSendouFormContext, storeOf } from "../form-context.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

const DATETIME_INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

type Props = Omit<
	FormFieldProps<"datetime">,
	"min" | "max" | "onBlur" | "error"
> & {
	disabled?: boolean;
};

let { name, label, bottomText, required, disabled }: Props = $props();

const id = $props.id();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(getSendouFormContext(), name);

let hasBadInput = $state(false);

const value = $derived(store.value(name) as Date | null | undefined);
const error = $derived(store.error(name));
const displayedError = $derived(
	error && hasBadInput ? "forms:errors.invalidDate" : error,
);
const aria = $derived(
	ariaAttributes({ name, bottomText, error: displayedError, required }),
);

// the input's value is local time without a zone, which `new Date(string)` would misread for some formats,
// so it is parsed against the format it was written with
function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
	hasBadInput = event.currentTarget.validity.badInput;
	const raw = event.currentTarget.value;
	const date = raw ? parse(raw, DATETIME_INPUT_FORMAT, new Date()) : null;
	store.change(name, date && isValid(date) ? date : undefined);
}

function handleBlur() {
	store.blur(name);
}
</script>

<FormFieldWrapper
	{id}
	{name}
	{label}
	{required}
	error={displayedError}
	{bottomText}
>
	<input
		{id}
		class="w-full"
		type="datetime-local"
		value={value ? format(value, DATETIME_INPUT_FORMAT) : ""}
		oninput={handleInput}
		onblur={handleBlur}
		{disabled}
		aria-invalid={aria["aria-invalid"]}
		aria-describedby={aria["aria-describedby"]}
		aria-errormessage={aria["aria-errormessage"]}
		aria-required={aria["aria-required"]}
	/>
</FormFieldWrapper>
