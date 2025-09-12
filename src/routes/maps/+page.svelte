<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';
	import ModeMapPoolPicker from '$lib/components/ModeMapPoolPicker.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { modesShort } from '$lib/constants/in-game/modes';
	import type { ModeWithStage } from '$lib/constants/in-game/types';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import * as MapPool from '$lib/core/maps/MapPool';
	import z from 'zod';
	import { partialMapPoolSchema } from '$lib/utils/zod';
	import Button from '$lib/components/buttons/Button.svelte';
	import X from '@lucide/svelte/icons/x';
	import Tally5 from '@lucide/svelte/icons/tally-5';
	import { m } from '$lib/paraglide/messages';
	import { stageIds } from '$lib/constants/in-game/stage-ids';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import SwitchFormField from '$lib/components/form/SwitchFormField.svelte';
	import { generateMapList, modesOrder } from '$lib/core/maps/map-list-generator';
	import {
		modesLongTranslations,
		modesShortTranslations,
		stageTranslations
	} from '$lib/utils/i18n';
	import CopyToClipboardButton from '$lib/components/CopyToClipboardButton.svelte';

	const AMOUNT_OF_MAPS_TO_GENERATE = stageIds.length;

	const MAP_POOL_CODEC = z.codec(z.string(), partialMapPoolSchema(), {
		decode: (string) => MapPool.fromSerialized(string),
		encode: (mapPool) => MapPool.toSerialized(mapPool)
	});

	const mapPool = new SearchParamState({
		key: 'pool',
		defaultValue: MapPool.empty(),
		schema: MAP_POOL_CODEC
	});

	let splatZonesEveryOther = $state(false);
	let mapList = $state<Array<ModeWithStage> | null>(null);

	function generateMapListFromSelection() {
		const [createdMapList] = generateMapList(
			$state.snapshot(mapPool.state),
			modesOrder(splatZonesEveryOther ? 'SZ_EVERY_OTHER' : 'EQUAL', MapPool.toModes(mapPool.state)),
			[AMOUNT_OF_MAPS_TO_GENERATE]
		);

		mapList = createdMapList;
	}
</script>

<OpenGraphMeta
	title="Map List Generator"
	ogTitle="Splatoon 3 map list generator"
	description="Generate a map list based on maps you choose or a tournament's map pool."
/>

<Main class="stack lg">
	{@render mapPoolPicker()}
	<a
		href={`https://maps.iplabs.ink/?3&pool=${MapPool.toSerialized(mapPool.state)}`}
		target="_blank"
		rel="noreferrer"
		class="tournament-map-list-link"
	>
		{m.common_maps_tournamentMaplist()}
	</a>
	<div class="stack items-center">
		<SwitchFormField label={m.common_maps_halfSz()} bind:checked={splatZonesEveryOther} />
	</div>
	<div class="stack items-center">
		<Button
			size="big"
			icon={ListOrdered}
			disabled={MapPool.isEmpty(mapPool.state)}
			onclick={generateMapListFromSelection}>{m.common_maps_createMapList()}</Button
		>
	</div>
	{#if mapList}
		{@render mapListWithCopy(mapList)}
	{/if}
</Main>

{#snippet mapPoolPicker()}
	{#each modesShort as mode (mode)}
		<div class="stack md">
			<ModeMapPoolPicker
				{mode}
				bind:pool={
					() => mapPool.state[mode] ?? [],
					(value) => mapPool.update({ ...mapPool.state, [mode]: value })
				}
			/>
			<div class="stack horizontal md justify-center">
				<Button
					size="miniscule"
					icon={Tally5}
					variant="outlined"
					onclick={() => {
						const newPool = { ...mapPool.state, [mode]: [...stageIds] };
						mapPool.update(newPool);
					}}>{m.builds_stats_all()}</Button
				>
				<Button
					size="miniscule"
					icon={X}
					variant="destructive"
					onclick={() => {
						const newPool = { ...mapPool.state };
						delete newPool[mode];
						mapPool.update(newPool);
					}}>{m.common_maps_template_none()}</Button
				>
			</div>
		</div>
	{/each}
{/snippet}

{#snippet mapListWithCopy(list: NonNullable<typeof mapList>)}
	{@const mapListString = list
		.map(
			({ mode, stageId }, i) =>
				`${i + 1}) ${modesShortTranslations[mode]()} ${stageTranslations[stageId]()}`
		)
		.join('\n')}
	<div class="map-list-container">
		<ol class="map-list">
			{#each list as { mode, stageId }, i (i)}
				<li>
					<abbr class="mode-abbr" title={modesLongTranslations[mode]()}>
						{modesShortTranslations[mode]()}
					</abbr>
					{stageTranslations[stageId]()}
				</li>
			{/each}
		</ol>
		<div>
			<CopyToClipboardButton content={mapListString} />
		</div>
	</div>
{/snippet}

<style>
	.tournament-map-list-link {
		font-size: var(--fonts-xxs);
		text-align: center;
		color: var(--color-primary);
	}

	.map-list {
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		margin-block-start: var(--s-4);
	}

	.map-list-container {
		margin: 0 auto;
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: var(--s-8);
	}

	.mode-abbr {
		color: var(--color-secondary);
		font-weight: var(--bold);
		text-decoration: none;
	}
</style>
