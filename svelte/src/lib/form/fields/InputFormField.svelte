<script lang="ts">
import type { FormFieldProps } from "~/form/types";
import { ariaAttributes } from "~/form/utils";
import { fieldOf, getSendouFormContext } from "../form-context.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

type Props = Omit<FormFieldProps<"text-field">, "error" | "onBlur"> & {
	disabled?: boolean;
	autofocus?: boolean;
};

let {
	name,
	label,
	bottomText,
	leftAddon,
	transformValue,
	placeholder,
	maxLength,
	required,
	inputType = "text",
	inputMode,
	disabled,
	autofocus,
}: Props = $props();

const id = $props.id();
const context = getSendouFormContext();
const { store } = context;

const remoteField = $derived(store ? undefined : fieldOf(context, name));
const error = $derived(
	store ? store.error(name) : remoteField?.issues()?.[0]?.message,
);

const aria = $derived(ariaAttributes({ name, bottomText, error, required }));

function handleStoreInput(event: Event & { currentTarget: HTMLInputElement }) {
	const value = event.currentTarget.value;
	store!.change(name, transformValue ? transformValue(value) : value);
}

function handleStoreBlur() {
	store!.blur(name);
}
</script>

<FormFieldWrapper {id} {name} {label} {required} {error} {bottomText}>
	<div class={leftAddon ? "input-container" : undefined}>
		{#if leftAddon}<span class="input-addon">{leftAddon}</span>{/if}
		<!-- svelte-ignore a11y_autofocus (opt-in per call site, used for inline edit forms) -->
		{#if store}
			<input
				{id}
				value={(store.value(name) as string | undefined) ?? ""}
				oninput={handleStoreInput}
				onblur={handleStoreBlur}
				class={leftAddon ? "in-container" : undefined}
				type={inputType}
				inputmode={inputMode}
				autocapitalize={inputMode ? "off" : undefined}
				spellcheck={inputMode ? false : undefined}
				maxlength={maxLength}
				{disabled}
				autocomplete="off"
				{autofocus}
				placeholder={context.translate(placeholder)}
				aria-invalid={aria["aria-invalid"]}
				aria-describedby={aria["aria-describedby"]}
				aria-errormessage={aria["aria-errormessage"]}
				aria-required={aria["aria-required"]}
			/>
		{:else}
			<input
				{id}
				{...remoteField!.as("text")}
				oninput={transformValue
					? (event) => remoteField!.set(transformValue(event.currentTarget.value))
					: undefined}
				class={leftAddon ? "in-container" : undefined}
				type={inputType}
				inputmode={inputMode}
				autocapitalize={inputMode ? "off" : undefined}
				spellcheck={inputMode ? false : undefined}
				maxlength={maxLength}
				{disabled}
				autocomplete="off"
				{autofocus}
				placeholder={context.translate(placeholder)}
				{...ariaAttributes({ name, bottomText, error, required })}
			/>
		{/if}
	</div>
</FormFieldWrapper>
