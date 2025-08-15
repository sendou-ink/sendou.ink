<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Select from '../Select.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import { ariaAttributes } from './utils';

	type Props = FormFieldProps<'dual-select'> & {
		value: [string | null, string | null];
		onblur?: () => void;
		clearable?: boolean;
	};

	let { name, bottomText, error, onblur, value = $bindable(), clearable, fields }: Props = $props();
	const id = $props.id();

	$inspect(value);
</script>

<div class="container stack xs">
	<div class="stack horizontal md">
		{#each fields as { items, label }, i}
			<SelectFormField {id} {clearable} {items} {label} bind:value={value[i]} />
			<!-- xxx: bind not working, why? -->
		{/each}
	</div>
	<input type="hidden" {name} value={JSON.stringify(value)} />
	<BottomText info={bottomText} {error} fieldId={id} />
</div>

<style>
	.container {
		--select-width: 134.5px;
	}
</style>
