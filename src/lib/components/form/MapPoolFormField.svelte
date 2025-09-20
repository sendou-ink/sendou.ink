<script lang="ts">
	import type { ModeShort } from '$lib/constants/in-game/types';
	import ModeMapPoolPicker from '../ModeMapPoolPicker.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import type { FormFieldProps } from '$lib/form/types';
	import { modesShort } from '$lib/constants/in-game/modes';
	import { BANNED_MAPS } from '$lib/constants/sendouq';
	import * as R from 'remeda';
	import * as MapPool from '$lib/core/maps/MapPool';

	type Props = FormFieldProps<'map-pool'> & {
		modes?: ModeShort[];
		name: string;
		value: MapPool.MapPool;
	};

	let {
		modes = [...modesShort],
		minCount,
		maxCount,
		disableBannedMaps,
		name,
		label,
		error,
		bottomText,
		value = $bindable()
	}: Props = $props();
	const id = $props.id();
</script>

<div class="stack xs">
	{#if label}
		<Label for={id} required={Boolean(minCount)}>
			{label}
		</Label>
	{/if}
	<div class="stack lg">
		{#each modes as mode (mode)}
			<ModeMapPoolPicker
				{mode}
				{maxCount}
				bind:pool={value[mode]}
				bannedMaps={disableBannedMaps ? BANNED_MAPS[mode] : undefined}
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
