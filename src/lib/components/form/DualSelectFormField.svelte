<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import BottomText from './BottomText.svelte';
	import SelectFormField from './SelectFormField.svelte';

	type Props = FormFieldProps<'dual-select'> & {
		value: [string | null, string | null];
		clearable?: boolean;
	};

	let { name, bottomText, error, onblur, value = $bindable(), clearable, fields }: Props = $props();
	const id = $props.id();
</script>

<div class="container stack xs">
	<div class="stack horizontal md">
		{#each fields as { items, label }, i (label)}
			<SelectFormField id={id + i} {clearable} {items} {label} {onblur} bind:value={value[i]} />
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
