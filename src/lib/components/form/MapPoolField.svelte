<script lang="ts">
	import type { ModeShort } from '$lib/constants/in-game/types';
	import ModeMapPoolPicker from '../ModeMapPoolPicker.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import type { FormFieldProps } from '$lib/form/types';

	type Props = FormFieldProps<'custom'> & {
		modes: ModeShort[];
		maxAmount: number;
		name: string;
	};

	let { modes, maxAmount, name, label, error, bottomText }: Props = $props();
	const id = $props.id();
</script>

<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	<!-- xxx: input type hidden -->
	<div class="stack lg">
		{#each modes as mode (mode)}
			<ModeMapPoolPicker {mode} {maxAmount} pool={[]} />
		{/each}
	</div>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
