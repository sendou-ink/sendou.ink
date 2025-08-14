<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Switch from '../Switch.svelte';
	import BottomText from './BottomText.svelte';

	type Props = Omit<FormFieldProps<'switch'>, 'type' | 'default'> & {
		checked?: boolean;
	};

	let { label, name, bottomText, error, checked = $bindable(false) }: Props = $props();
	const id = $props.id();
</script>

<div>
	<div class="stack horizontal sm items-center">
		<Switch {name} {id} bind:checked>
			{label}
		</Switch>
	</div>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
