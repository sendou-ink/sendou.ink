<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Input from '../Input.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { ariaAttributes } from './utils';

	type Props = FormFieldProps<'text-field'> & {
		value: string;
		onblur?: () => void;
	};

	let {
		label,
		name,
		bottomText,
		leftAddon,
		maxLength,
		regExp,
		error,
		onblur,
		value = $bindable()
	}: Props = $props();
	const id = $props.id();
</script>

<div>
	<Label for={id} withMargin>
		{label}
	</Label>
	<Input
		{name}
		{id}
		{leftAddon}
		{onblur}
		maxlength={maxLength}
		bind:value
		{...ariaAttributes({
			id,
			bottomText,
			error
		})}
	/>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
