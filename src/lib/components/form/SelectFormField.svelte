<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Select from '../Select.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { ariaAttributes } from './utils';

	type Props = FormFieldProps<'select'> & {
		value?: string;
		onblur?: (e: FocusEvent) => void;
		clearable?: boolean;
	};

	let {
		label,
		name,
		bottomText,
		items,
		error,
		onblur,
		value = $bindable(''),
		clearable
	}: Props = $props();
	const id = $props.id();

	const itemsWithLabels = $derived(
		items.map((item) => ({
			...item,
			label: typeof item.label === 'function' ? item.label('en') : item.label
		}))
	);
</script>

<div>
	<Label for={id} withMargin>
		{label}
	</Label>
	<Select
		{name}
		{id}
		{onblur}
		{clearable}
		items={itemsWithLabels}
		bind:value
		{...ariaAttributes({
			id,
			bottomText,
			error
		})}
	/>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
