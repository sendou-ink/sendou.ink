<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Input from '../Input.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';

	type Props = FormFieldProps<'text-field'> & {
		value?: string;
	};

	let {
		label,
		name,
		bottomText,
		leftAddon,
		maxLength,
		regExp,
		error,
		value = $bindable('')
	}: Props = $props();
	const id = $props.id();
</script>

<!-- xxx: pattern not working -->

<div>
	<Label for={id} withMargin>
		{label}
	</Label>
	<Input
		{name}
		{id}
		{leftAddon}
		maxlength={maxLength}
		pattern={regExp ? regExp.pattern.source : undefined}
		bind:value
	/>
	<BottomText info={bottomText} {error} />
</div>
