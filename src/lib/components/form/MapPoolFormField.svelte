<script lang="ts">
	import type { ModeShort, StageId } from '$lib/constants/in-game/types';
	import ModeMapPoolPicker from '../ModeMapPoolPicker.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import type { FormFieldProps } from '$lib/form/types';
	import { rankedModesShort } from '$lib/constants/in-game/modes';

	export type MapPool = Record<ModeShort, StageId[]>;

	type Props = FormFieldProps<'custom'> & {
		modes?: ModeShort[];
		maxCount: number;
		name: string;
		value: MapPool;
	};

	let {
		modes = rankedModesShort,
		maxCount,
		name,
		label,
		error,
		bottomText,
		value = $bindable()
	}: Props = $props();
	const id = $props.id();
</script>

<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	<div class="stack lg">
		{#each modes as mode (mode)}
			<ModeMapPoolPicker {mode} {maxCount} bind:pool={value[mode]} />
		{/each}
	</div>
	<input type="hidden" {name} value={JSON.stringify(value)} />
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
