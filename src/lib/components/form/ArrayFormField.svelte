<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Button from '../buttons/Button.svelte';
	import BottomText from './BottomText.svelte';
	import FormField from './FormField.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import { m } from '$lib/paraglide/messages';

	type Props = FormFieldProps<'array'> & {
		value: Array<unknown>;
	};

	let { label, name, bottomText, error, field, min, max, value = $bindable() }: Props = $props();
	const id = $props.id();

	let count = $state(1);
</script>

<fieldset class="container stack md">
	<legend>
		{label}
	</legend>
	{#each { length: count }}
		<FormField {field} name={`${name}[]`} />
	{/each}
	<BottomText info={bottomText} {error} fieldId={id} />
	<div class="stack sm horizontal">
		<Button size="small" icon={Plus} onclick={() => count++} disabled={count >= max}
			>{m.common_actions_add()}</Button
		>
		<Button
			class={count === 1 ? 'invisible' : undefined}
			size="small"
			icon={Minus}
			variant="destructive"
			onclick={() => count--}>{m.common_actions_remove()}</Button
		>
	</div>
</fieldset>

<style>
	.container {
		:global {
			svg {
				stroke-width: 3px;
			}
		}
	}
</style>
