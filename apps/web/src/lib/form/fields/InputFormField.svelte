<script lang="ts">
import type { Snippet } from "svelte";
import { ariaAttributes, translateFormText } from "../form-utils.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	labelPopover?: Snippet;
	bottomText?: string;
	leftAddon?: string;
	transformValue?: (value: string) => string;
	placeholder?: string;
	maxLength: number;
	error?: string;
	onBlur?: (latestValue?: unknown) => void;
	required?: boolean;
	inputType?: "text" | "number";
	disabled?: boolean;
	autoFocus?: boolean;
	value: string;
	onChange: (value: string) => void;
}

let {
	name,
	label,
	labelPopover,
	bottomText,
	leftAddon,
	transformValue,
	placeholder,
	maxLength,
	error,
	onBlur,
	required,
	inputType = "text",
	disabled,
	autoFocus,
	value,
	onChange,
}: Props = $props();

const id = $props.id();

const translatedPlaceholder = $derived(translateFormText(placeholder));
</script>

<FormFieldWrapper {id} {name} {label} {labelPopover} {required} {error} {bottomText}>
	<div class={leftAddon ? "input-container" : undefined}>
		{#if leftAddon}<span class="input-addon">{leftAddon}</span>{/if}
		<!-- svelte-ignore a11y_autofocus -- opt-in per call site, used for inline edit forms -->
		<input
			{id}
			class={leftAddon ? "in-container" : undefined}
			type={inputType}
			{value}
			oninput={(event) =>
				onChange(
					transformValue
						? transformValue(event.currentTarget.value)
						: event.currentTarget.value,
				)}
			onblur={() => onBlur?.()}
			maxlength={maxLength}
			{disabled}
			autofocus={autoFocus}
			placeholder={translatedPlaceholder}
			{...ariaAttributes({ name, bottomText, error, required })}
		/>
	</div>
</FormFieldWrapper>
