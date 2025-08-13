<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Textarea from '../Textarea.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';

	type Props = FormFieldProps<'text-area'> & {
		value?: string;
	};

	let { label, name, bottomText, maxLength, value = $bindable('') }: Props = $props();
	const id = $props.id();
</script>

<div>
	<Label for={id} withMargin valueLimits={{ current: value.length, max: maxLength }}>
		{label}
	</Label>
	<Textarea {name} {id} bind:value />
	{#if bottomText}
		<BottomText>{bottomText}</BottomText>
	{/if}
</div>
