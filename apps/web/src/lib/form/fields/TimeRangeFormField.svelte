<script lang="ts">
import { translateFormText } from "../form-utils.ts";
import FormFieldMessages from "./FormFieldMessages.svelte";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

type TimeRange = { start: string; end: string } | null;

interface Props {
	name?: string;
	label?: string;
	bottomText?: string;
	startLabel?: string;
	endLabel?: string;
	error?: string;
	onBlur?: (latestValue?: unknown) => void;
	value: TimeRange;
	onChange: (value: TimeRange) => void;
	disabled?: boolean;
}

let {
	name,
	label,
	bottomText,
	startLabel,
	endLabel,
	error,
	onBlur,
	value,
	onChange,
	disabled,
}: Props = $props();

const startId = $props.id();
const endId = `${startId}-end`;

const translatedLabel = $derived(translateFormText(label));
const translatedStartLabel = $derived(translateFormText(startLabel));
const translatedEndLabel = $derived(translateFormText(endLabel));

function handleStartChange(event: Event & { currentTarget: HTMLInputElement }) {
	const newStart = event.currentTarget.value;
	if (!newStart && !value?.end) {
		onChange(null);
	} else {
		onChange({ start: newStart, end: value?.end ?? "" });
	}
}

function handleEndChange(event: Event & { currentTarget: HTMLInputElement }) {
	const newEnd = event.currentTarget.value;
	if (!newEnd && !value?.start) {
		onChange(null);
	} else {
		onChange({ start: value?.start ?? "", end: newEnd });
	}
}
</script>

<div class="stack xs">
	{#if translatedLabel}
		<span class="text-sm font-semi-bold">{translatedLabel}</span>
	{/if}
	<div class="stack horizontal sm">
		<FormFieldWrapper id={startId} label={translatedStartLabel}>
			<input
				id={startId}
				type="time"
				value={value?.start ?? ""}
				oninput={handleStartChange}
				onblur={() => onBlur?.()}
				{disabled}
				class="size-extra-small"
			/>
		</FormFieldWrapper>
		<FormFieldWrapper id={endId} label={translatedEndLabel}>
			<input
				id={endId}
				type="time"
				value={value?.end ?? ""}
				oninput={handleEndChange}
				onblur={() => onBlur?.()}
				{disabled}
				class="size-extra-small"
			/>
		</FormFieldWrapper>
	</div>
	<FormFieldMessages {name} {error} {bottomText} />
</div>
