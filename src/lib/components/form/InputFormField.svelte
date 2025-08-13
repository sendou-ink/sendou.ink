<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Input from '../Input.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';

	type Props = FormFieldProps<'text-field'> & {
		value?: string;
	};

	let { label, name, bottomText, leftAddon, value = $bindable('') }: Props = $props();
	const id = $props.id();
</script>

<div>
	<Label for={id} withMargin>
		{label}
	</Label>
	<Input {name} {id} {leftAddon} bind:value />
	{#if bottomText}
		<BottomText>{bottomText}</BottomText>
	{/if}
</div>
