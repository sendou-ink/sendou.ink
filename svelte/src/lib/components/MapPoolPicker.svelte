<!-- Picks stages of a map pool, one tab per mode. The SendouQ legality filter of the React picker is not ported. -->
<script lang="ts" module>
/** A preset offered in the picker's quick fill row. */
export type MapPoolQuickFill = { label: string; mapPool: MapPool };
</script>

<script lang="ts">
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { modeImageUrl, stageBannerImageUrl } from "~/utils/urls";
import { modeLongName, stageName } from "#lib/game/game-names.ts";
import MapPoolQuickFillRow from "./MapPoolQuickFillRow.svelte";
import Image from "./Image.svelte";
import Tab from "./Tab.svelte";
import TabList from "./TabList.svelte";
import TabPanel from "./TabPanel.svelte";
import Tabs from "./Tabs.svelte";

interface Props {
	mapPool: MapPool;
	onChange: (mapPool: MapPool) => void;
	/** Shows a quick fill row with these presets plus clearing and pasting a map pool link. Presets apply only to an empty pool. */
	quickFill?: MapPoolQuickFill[];
	/** Limits the pool to these modes, default every mode. */
	modes?: readonly ModeShort[];
	disabled?: boolean;
	"aria-label"?: string;
}

let {
	mapPool,
	onChange,
	quickFill,
	modes = modesShort,
	disabled,
	"aria-label": ariaLabel,
}: Props = $props();

const id = $props.id();

// svelte-ignore state_referenced_locally (the initially shown mode comes from the pool the picker opens with)
let selectedMode = $state(initialMode(mapPool, modes));
const shownMode = $derived(modes.includes(selectedMode) ? selectedMode : modes[0]);

const tabKey = (mode: ModeShort) => `${id}-${mode}`;

function handleChange(newMapPool: MapPool) {
	onChange(
		new MapPool(
			newMapPool.stageModePairs.filter((pair) => modes.includes(pair.mode)),
		),
	);
}

function toggleStage(mode: ModeShort, stageId: StageId) {
	const stages = mapPool.parsed[mode];

	handleChange(
		new MapPool({
			...mapPool.parsed,
			[mode]: stages.includes(stageId)
				? stages.filter((poolStageId) => poolStageId !== stageId)
				: [...stages, stageId],
		}),
	);
}

function initialMode(pool: MapPool, availableModes: readonly ModeShort[]) {
	return (
		availableModes.find((mode) => pool.hasMode(mode)) ??
		availableModes.find((mode) => mode !== "TW") ??
		availableModes[0]
	);
}
</script>

<div class="root">
	{#if quickFill}
		<MapPoolQuickFillRow
			presets={quickFill}
			{disabled}
			isPoolEmpty={mapPool.isEmpty()}
			onFill={handleChange}
		/>
	{/if}
	<Tabs
		class="tabs"
		selectedKey={tabKey(shownMode)}
		onSelectionChange={(key) => {
			selectedMode = modes.find((mode) => tabKey(mode) === key) ?? shownMode;
		}}
	>
		<TabList aria-label={ariaLabel}>
			{#each modes as mode (mode)}
				<Tab id={tabKey(mode)}>
					{#snippet icon()}
						<Image path={modeImageUrl(mode)} alt="" width={18} height={18} />
					{/snippet}
					{modeLongName(mode)}
					<span class="count">{mapPool.countMapsByMode(mode)}</span>
				</Tab>
			{/each}
		</TabList>
		{#each modes as mode (mode)}
			<TabPanel id={tabKey(mode)}>
				<div class="stages">
					{#each stageIds as stageId (stageId)}
						<label
							class="stage"
							style:--stage-banner={`url(${stageBannerImageUrl(stageId)})`}
						>
							<input
								type="checkbox"
								checked={mapPool.has({ stageId, mode })}
								onchange={() => toggleStage(mode, stageId)}
								{disabled}
							/>
							{stageName(stageId)}
						</label>
					{/each}
				</div>
			</TabPanel>
		{/each}
	</Tabs>
</div>

<style>
	@layer components {
		.root {
			display: flex;
			flex-direction: column;
			gap: var(--s-4);

			& :global(.tabs) {
				--tabs-gap: var(--s-4);
			}
		}

		.count {
			display: inline-grid;
			place-items: center;
			min-width: 1.25rem;
			height: 1.25rem;
			margin-inline-start: var(--s-1-5);
			padding-inline: var(--s-1);
			border-radius: var(--radius-full);
			background-color: var(--color-bg-higher);
			color: var(--color-text-high);
			font-size: var(--font-2xs);
			font-variant-numeric: tabular-nums;

			:global([data-selected]) & {
				background-color: var(--color-fill-accent);
				color: var(--color-fg-on-accent);
			}
		}

		.stages {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
			gap: var(--s-2);
		}

		.stage {
			display: flex;
			align-items: center;
			gap: var(--s-2-5);
			min-height: var(--field-size-lg);
			margin: 0;
			padding: var(--s-2) var(--s-3);
			border: var(--border-style);
			border-radius: var(--radius-box);
			--stage-overlay: oklch(0% 0 0 / 50%);
			background-color: var(--color-bg-high);
			background-image:
				linear-gradient(var(--stage-overlay), var(--stage-overlay)),
				var(--stage-banner);
			background-position: center;
			background-size: cover;
			color: var(--color-text-on-dark);
			text-shadow:
				0 1px 2px oklch(0% 0 0 / 90%),
				0 0 8px oklch(0% 0 0 / 70%);
			font-size: var(--font-xs);
			font-weight: var(--weight-semi);
			line-height: 1.2;
			cursor: pointer;

			&:hover {
				border-color: var(--color-border-high);
			}

			&:has(input:checked) {
				border-color: var(--color-fg-accent);
				box-shadow: inset 0 0 0 1px var(--color-fg-accent);
			}

			&:has(input:focus-visible) {
				outline: var(--focus-ring);
				outline-offset: 1px;
			}

			&:has(input:disabled) {
				cursor: not-allowed;
				opacity: 0.6;
			}

			& input {
				flex-shrink: 0;
			}
		}
	}
</style>
