<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import { useId } from 'bits-ui';
	import Select from '../Select.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { ariaAttributes } from './utils';
	import { getLocale } from '$lib/paraglide/runtime';

	type Props = Omit<FormFieldProps<'select'>, 'name'> & {
		value: string | null;
		clearable?: boolean;
		id?: string;
		name?: string;
		onSelect?: (value: string) => void;
	};

	let {
		label,
		name,
		onSelect,
		bottomText,
		items,
		error,
		onblur,
		value = $bindable(),
		clearable,
		id = useId()
	}: Props = $props();
	const itemsWithLabels = $derived(
		items.map((item) => ({
			...item,
			label: typeof item.label === 'function' ? item.label(getLocale()) : item.label
		}))
	);
</script>

<div class="stack xs">
	<Label for={id} required={!clearable}>
		{label}
	</Label>
	<Select
		{name}
		{id}
		{onblur}
		{clearable}
		items={itemsWithLabels}
		onchange={onSelect
			? (e) => e.currentTarget.value && onSelect(e.currentTarget.value)
			: undefined}
		bind:value
		{...ariaAttributes({
			id,
			bottomText,
			error
		})}
	/>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
