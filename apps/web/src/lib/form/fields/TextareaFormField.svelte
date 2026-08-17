<script lang="ts">
import { ariaAttributes } from "../form-utils.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	maxLength: number;
	error?: string;
	onBlur?: (latestValue?: unknown) => void;
	required?: boolean;
	disabled?: boolean;
	autoFocus?: boolean;
	value: string;
	onChange: (value: string) => void;
}

let {
	name,
	label,
	bottomText,
	maxLength,
	error,
	onBlur,
	required,
	disabled,
	autoFocus,
	value,
	onChange,
}: Props = $props();

const id = $props.id();

/**
 * Autofocusing a textarea leaves the caret before any existing text, which is
 * the wrong place when editing something already written.
 */
function moveCaretToEnd(element: HTMLTextAreaElement) {
	element.focus();
	element.setSelectionRange(element.value.length, element.value.length);
}
</script>

<FormFieldWrapper
	{id}
	{name}
	{label}
	{required}
	{error}
	{bottomText}
	valueLimits={maxLength
		? { current: value?.length ?? 0, max: maxLength }
		: undefined}
>
	<textarea
		{id}
		{value}
		oninput={(event) => onChange(event.currentTarget.value)}
		onblur={() => onBlur?.()}
		{disabled}
		{@attach autoFocus ? moveCaretToEnd : undefined}
		{...ariaAttributes({ name, bottomText, error, required })}
	></textarea>
</FormFieldWrapper>
