<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Switch from '../Switch.svelte';
	import BottomText from './BottomText.svelte';

	type Props = Omit<FormFieldProps<'switch'>, 'type' | 'default'> & {
		checked?: boolean;
	};

	let { label, name, bottomText, error, checked = $bindable(false) }: Props = $props();
</script>

<div>
	<div class="stack horizontal sm items-center">
		<Switch {name} bind:checked>
			{label}
		</Switch>
	</div>
	<BottomText info={bottomText} {error} />
</div>
