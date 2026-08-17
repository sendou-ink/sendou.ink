<script lang="ts">
import type { ModeShort, StageId } from "@sendou/in-game-lists/types";
import { ChipRadio, ChipRadioGroup, Switch, TabPanel } from "@sendou/components";
import { MapPool } from "@sendou/map-list-generator/map-pool";
import ModeImage from "#lib/components/ModeImage.svelte";
import StageImage from "#lib/components/StageImage.svelte";
import Table from "#lib/components/Table.svelte";
import { TAB_KEYS } from "#lib/components/match-page/match-page-constants.ts";
import { modeLongName, stageName } from "#lib/modules/i18n/messages.ts";
import { dynamicMessage } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import * as ScrimMapByMap from "../ScrimMapByMap.ts";
import type { ScrimPageData } from "../scrims.remote.ts";

type View = "MODE" | "STAGE" | "BOTH";

const VIEW_OPTIONS: View[] = ["MODE", "STAGE", "BOTH"];

interface Props {
	data: ScrimPageData;
}

let { data }: Props = $props();

const viewerSide = $derived(data.mapByMap.viewerSide);
const maps = $derived(data.mapByMap.maps);
const ownPool = $derived(
	data.mapByMap.ownPool ? new MapPool(data.mapByMap.ownPool) : null,
);

let view = $state<View>("BOTH");
// svelte-ignore state_referenced_locally -- whether a pool exists seeds the initial toggle only
let restrictToPool = $state(Boolean(ownPool));

const stats = $derived(
	viewerSide
		? ScrimMapByMap.stats(maps, viewerSide, {
				restrictToPool: restrictToPool && ownPool ? ownPool : undefined,
			})
		: null,
);

interface StatsRow {
	key: string;
	wins: number;
	losses: number;
	winRate: number;
}

function sortRows(rows: Array<{ key: string; wins: number; losses: number }>) {
	return rows
		.map((row) => ({
			...row,
			winRate: row.wins / (row.wins + row.losses),
		}))
		.sort((a, b) => {
			if (b.winRate !== a.winRate) return b.winRate - a.winRate;
			return b.wins + b.losses - (a.wins + a.losses);
		});
}

function viewLabel(option: View) {
	return dynamicMessage(`scrims_mapByMap_stats_view_${option}`);
}
</script>

<TabPanel id={TAB_KEYS.STATS}>
	{#if !viewerSide || maps.length === 0}
		<div class="empty">{m.scrims_mapByMap_stats_empty()}</div>
	{:else if stats}
		<div class="root" data-testid="scrim-stats-root">
			<div class="controls">
				<ChipRadioGroup>
					{#each VIEW_OPTIONS as option (option)}
						<ChipRadio
							name="scrim-stats-view"
							value={option}
							checked={view === option}
							onChange={(value) => {
								view = value as View;
							}}
						>
							{viewLabel(option)}
						</ChipRadio>
					{/each}
				</ChipRadioGroup>
				{#if ownPool}
					<label class="toggleRow">
						<Switch
							isSelected={restrictToPool}
							onChange={(isSelected) => {
								restrictToPool = isSelected;
							}}
						/>
						{m.scrims_mapByMap_stats_restrictToPool()}
					</label>
				{/if}
			</div>

			{#if view === "MODE"}
				{@render statsTable(sortRows(stats.byMode), modeLabel)}
			{:else if view === "STAGE"}
				{@render statsTable(sortRows(stats.byStage), stageLabel)}
			{:else}
				{@render statsTable(sortRows(stats.byStageMode), stageModeLabel)}
			{/if}
		</div>
	{/if}
</TabPanel>

{#snippet modeLabel(key: string)}
	<span class="stageModeLabel">
		<ModeImage mode={key as ModeShort} size={20} />
		{modeLongName(key)}
	</span>
{/snippet}

{#snippet stageLabel(key: string)}
	<span class="stageModeLabel">
		<StageImage
			stageId={Number(key) as StageId}
			width={36}
			class="stageImage"
		/>
		{stageName(Number(key))}
	</span>
{/snippet}

{#snippet stageModeLabel(key: string)}
	{@const [stageId, mode] = key.split("-")}
	<span class="stageModeLabel">
		<ModeImage mode={mode as ModeShort} size={20} />
		<StageImage
			stageId={Number(stageId) as StageId}
			width={36}
			class="stageImage"
		/>
		{stageName(Number(stageId))}
	</span>
{/snippet}

{#snippet statsTable(
	rows: StatsRow[],
	label: import("svelte").Snippet<[string]>,
)}
	{#if rows.length === 0}
		<div class="empty">{m.scrims_mapByMap_stats_empty()}</div>
	{:else}
		<Table>
			<thead>
				<tr>
					<th>{m.scrims_mapByMap_stats_col_label()}</th>
					<th class="cellNum">{m.scrims_mapByMap_stats_col_wins()}</th>
					<th class="cellNum">{m.scrims_mapByMap_stats_col_losses()}</th>
					<th class="cellNum">{m.scrims_mapByMap_stats_col_winPct()}</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.key)}
					<tr>
						<td class="labelCell">{@render label(row.key)}</td>
						<td class="cellNum">{row.wins}</td>
						<td class="cellNum">{row.losses}</td>
						<td class="cellNum">{Math.round(row.winRate * 100)}%</td>
					</tr>
				{/each}
			</tbody>
		</Table>
	{/if}
{/snippet}

<style>
	.root {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}

	.toggleRow {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--font-sm);
	}

	.labelCell {
		white-space: nowrap;
	}

	.cellNum {
		width: 4rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.empty {
		color: var(--color-text-high);
		font-style: italic;
	}

	.stageModeLabel {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);

		& > :global(*) {
			flex-shrink: 0;
		}
	}

	.stageModeLabel :global(.stageImage) {
		border-radius: var(--radius-field);
	}
</style>
