<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Textarea from '../Textarea.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { ariaAttributes } from './utils';

	type Props = FormFieldProps<'text-area'> & {
		value?: string;
		onblur?: () => void;
	};

	let {
		label,
		name,
		bottomText,
		maxLength,
		error,
		onblur,
		value = $bindable('')
	}: Props = $props();
	const id = $props.id();
</script>

<div>
	<Label for={id} withMargin valueLimits={{ current: value?.length, max: maxLength }}>
		{label}
	</Label>
	<Textarea
		{name}
		{id}
		{onblur}
		bind:value
		{...ariaAttributes({
			id,
			bottomText,
			error
		})}
	/>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
