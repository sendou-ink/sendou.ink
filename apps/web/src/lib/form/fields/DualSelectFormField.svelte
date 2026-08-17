<script lang="ts">
import type { FormFieldItems } from "../form-types.ts";
import FormFieldMessages from "./FormFieldMessages.svelte";
import SelectFormField from "./SelectFormField.svelte";

type DualValue = [string | null, string | null];

interface Props {
	name: string;
	bottomText?: string;
	error?: string;
	onBlur?: (latestValue?: unknown) => void;
	fields: [
		{ label?: string; items: FormFieldItems<string> },
		{ label?: string; items: FormFieldItems<string> },
	];
	value: DualValue;
	onChange: (value: DualValue) => void;
	disabled?: boolean;
}

let { name, bottomText, error, onBlur, fields, value, onChange, disabled }: Props =
	$props();
</script>

<div class="stack xs">
	<div class="stack horizontal md">
		<SelectFormField
			label={fields[0].label}
			items={fields[0].items}
			value={value[0]}
			onChange={(newValue) => onChange([newValue, value[1]])}
			{onBlur}
			clearable
			{disabled}
		/>
		<SelectFormField
			label={fields[1].label}
			items={fields[1].items}
			value={value[1]}
			onChange={(newValue) => onChange([value[0], newValue])}
			{onBlur}
			clearable
			{disabled}
		/>
	</div>
	<FormFieldMessages {name} {error} {bottomText} />
</div>
