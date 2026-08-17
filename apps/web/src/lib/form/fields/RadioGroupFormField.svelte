<script lang="ts">
import type { FormFieldItemsWithImage } from "../form-types.ts";
import { translateItemLabel } from "../form-utils.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	items: FormFieldItemsWithImage<string>;
	error?: string;
	onBlur?: (latestValue?: unknown) => void;
	value: string | null;
	onChange: (value: string) => void;
	minLength?: number;
	disabled?: boolean;
}

let {
	name,
	label,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	minLength,
	disabled,
}: Props = $props();

const id = $props.id();

const itemsWithLabels = $derived(
	items.map((item) => ({
		...item,
		resolvedLabel: translateItemLabel(item.label),
	})),
);

const required = $derived(typeof minLength !== "number" || minLength > 0);
</script>

<FormFieldWrapper {id} {name} {label} {required} {error} {bottomText}>
	<div
		role="radiogroup"
		aria-orientation="vertical"
		aria-labelledby={id}
		class="stack sm items-start"
	>
		{#each itemsWithLabels as item (item.value)}
			<div class="stack horizontal sm items-center">
				<input
					type="radio"
					id={`${id}-${item.value}`}
					name={id}
					value={item.value}
					checked={value === item.value}
					onchange={() => onChange(item.value)}
					onblur={() => onBlur?.()}
					{disabled}
				/>
				<label
					for={`${id}-${item.value}`}
					class="stack horizontal sm items-center mb-0 whitespace-nowrap"
				>
					{#if item.imgSrc}
						<img src={item.imgSrc} width={24} height={24} alt="" />
					{/if}
					{item.resolvedLabel}
				</label>
			</div>
		{/each}
	</div>
</FormFieldWrapper>
