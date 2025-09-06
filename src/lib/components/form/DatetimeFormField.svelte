<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import { format, parseISO } from 'date-fns';
	import Input from '../Input.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import { ariaAttributes } from './utils';

	type Props = FormFieldProps<'datetime'> & {
		value?: Date;
	};

	let { label, name, bottomText, error, required, onblur, value = $bindable() }: Props = $props();

	const id = $props.id();
</script>

<div class="stack xs">
	<Label for={id} {required}>
		{label}
	</Label>
	<Input
		{id}
		{onblur}
		type="datetime-local"
		bind:value={
			() => (value ? format(value, "yyyy-MM-dd'T'HH:mm") : undefined),
			(valueStr) => {
				if (!valueStr) {
					value = undefined;
					return;
				}

				value = parseISO(valueStr);
			}
		}
		{...ariaAttributes({
			id,
			bottomText,
			error
		})}
	/>
	<input {name} type="hidden" value={value ? value.toISOString() : ''} />
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
