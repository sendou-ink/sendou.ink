<script lang="ts" generics="T extends 'radio' | 'checkbox'">
	import type { FormFieldProps } from '$lib/form/types';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { getLocale } from '$lib/paraglide/runtime';

	type Props = Omit<FormFieldProps<'radio-group'>, 'name'> & {
		value: T extends 'radio' ? string : string[];
		name: string;
		inputType: T;
	};

	let { label, name, bottomText, items, error, inputType, value = $bindable() }: Props = $props();
	const id = $props.id();

	const itemsWithLabels = $derived(
		items.map((item) => ({
			...item,
			label: typeof item.label === 'function' ? item.label(getLocale()) : item.label
		}))
	);
</script>

<div class="stack xs" role="radiogroup" aria-orientation="vertical" aria-labelledby={id}>
	<Label {id}>
		{label}
	</Label>
	{#each itemsWithLabels as item (item.label)}
		<div class="stack horizontal sm-plus items-center">
			<!-- some duplication here because when binding "type" has to be static according to Svelte rules -->
			{#if inputType === 'radio'}
				<input
					type="radio"
					bind:group={value}
					id={`${id}-${item.value}`}
					{name}
					value={item.value}
				/>
			{:else}
				<input
					type="checkbox"
					bind:group={value}
					id={`${id}-${item.value}`}
					{name}
					value={item.value}
				/>
			{/if}
			<label for={`${id}-${item.value}`} class="stack horizontal sm items-center"
				>{#if item.imgSrc}
					<img src={item.imgSrc} width={24} height={24} alt="" />
				{/if}{item.label}</label
			>
		</div>
	{/each}
	<BottomText info={bottomText} {error} fieldId={id} />
</div>

<style>
	/** TODO: round focus styling */
	input {
		accent-color: var(--color-secondary);
		height: max-content;
		border-radius: 100%;
		margin: auto 0;

		&:focus-visible {
			outline: 2px solid var(--color-secondary);
		}
	}

	label {
		font-weight: var(--semi-bold);
		font-size: var(--fonts-sm);
	}
</style>
