<script lang="ts">
import type { StageId } from "@sendou/in-game-lists/types";
import StageSelect from "#lib/components/StageSelect.svelte";
import { translateFormText } from "../form-utils.ts";
import FormFieldMessages from "./FormFieldMessages.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	error?: string;
	required?: boolean;
	onBlur?: (latestValue?: unknown) => void;
	value: StageId | null;
	onChange: (value: StageId) => void;
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
	disabled,
}: Props = $props();

const translatedLabel = $derived(translateFormText(label));
</script>

<div class="root">
	<StageSelect
		label={translatedLabel}
		{value}
		onChange={(stageId) => {
			onChange(stageId);
			onBlur?.(stageId);
		}}
		isRequired={required}
		isDisabled={disabled}
	/>
	<FormFieldMessages {name} {error} {bottomText} />
</div>

<style>
	.root {
		& :global(button[class]) {
			width: 100%;
		}
	}
</style>
