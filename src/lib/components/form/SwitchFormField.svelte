<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Switch from '../Switch.svelte';
	import BottomText from './BottomText.svelte';

	type Props = Omit<FormFieldProps<'toggle'>, 'type'> & {
		checked?: boolean;
	};

	let { label, name, bottomText, checked = $bindable(false) }: Props = $props();
</script>

<div>
	<div class="stack horizontal sm items-center">
		<Switch {name} bind:checked>
			{label}
		</Switch>
	</div>
	{#if bottomText}
		<BottomText>{bottomText}</BottomText>
	{/if}
</div>
