<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import { useId } from 'bits-ui';
	import Select from '../Select.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { ariaAttributes } from './utils';

	type Props = Omit<FormFieldProps<'select'>, 'name'> & {
		value: string | null;
		onblur?: () => void;
		clearable?: boolean;
		id?: string;
		name?: string;
	};

	let {
		label,
		name,
		bottomText,
		items,
		error,
		onblur,
		value = $bindable(null),
		clearable,
		id = useId()
	}: Props = $props();
	const itemsWithLabels = $derived(
		items.map((item) => ({
			...item,
			label: typeof item.label === 'function' ? item.label('en') : item.label
		}))
	);
</script>

<div class="stack xs">
	<Label for={id}>
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
