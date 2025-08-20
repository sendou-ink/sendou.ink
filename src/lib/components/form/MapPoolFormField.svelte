<script lang="ts">
	import type { ModeShort, StageId } from '$lib/constants/in-game/types';
	import ModeMapPoolPicker from '../ModeMapPoolPicker.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import type { FormFieldProps } from '$lib/form/types';
	import { rankedModesShort } from '$lib/constants/in-game/modes';
	import { BANNED_MAPS } from '$lib/constants/sendouq';
	import * as R from 'remeda';

	export type MapPool = Record<ModeShort, StageId[]>;

	type Props = FormFieldProps<'map-pool'> & {
		modes?: ModeShort[];
		maxCount: number;
		disabledBannedMaps: boolean;
		name: string;
		value: MapPool;
	};

	let {
		modes = rankedModesShort,
		maxCount,
		disabledBannedMaps,
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
			<ModeMapPoolPicker
				{mode}
				{maxCount}
				bind:pool={value[mode]}
				bannedMaps={disabledBannedMaps ? BANNED_MAPS[mode] : undefined}
			/>
		{/each}
	</div>
	<input
		type="hidden"
		{name}
		value={JSON.stringify(R.pipe(value, R.pick(modes), R.omitBy(R.isEmpty)))}
	/>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
