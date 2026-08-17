<script lang="ts">
import DatePicker from "#lib/components/DatePicker.svelte";
import { errorMessageId, translateFormText } from "../form-utils.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	error?: string;
	required?: boolean;
	onBlur?: (latestValue?: unknown) => void;
	value: Date | undefined;
	onChange: (value: Date | undefined) => void;
	granularity?: "day" | "minute";
	disabled?: boolean;
}

let {
	name,
	label,
	bottomText,
	error,
	required,
	onBlur,
	value,
	onChange,
	granularity = "minute",
	disabled,
}: Props = $props();

const translatedLabel = $derived(translateFormText(label));
const translatedError = $derived(translateFormText(error));
const translatedBottomText = $derived(translateFormText(bottomText));
</script>

<FormFieldWrapper id={name} {name}>
	<DatePicker
		label={translatedLabel ?? ""}
		{granularity}
		errorText={translatedError}
		errorId={errorMessageId(name)}
		bottomText={translatedBottomText}
		isRequired={required}
		isDisabled={disabled}
		value={value ?? null}
		onChange={(next) => onChange(next ?? undefined)}
		onBlur={() => onBlur?.()}
	/>
</FormFieldWrapper>
