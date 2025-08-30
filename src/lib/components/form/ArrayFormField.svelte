<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import BottomText from './BottomText.svelte';
	import FormField from './FormField.svelte';
	import Label from './Label.svelte';

	type Props = FormFieldProps<'array'> & {
		value: Array<unknown>;
	};

	let {
		label,
		name,
		bottomText,
		error,
		onblur,
		field,
		min,
		max,
		value = $bindable()
	}: Props = $props();
	const id = $props.id();

	let count = $state(1);
</script>

<div class="stack xs">
	<Label for={id} required={min > 0}>
		{label}
	</Label>
	<FormField {field} name="test" />
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
