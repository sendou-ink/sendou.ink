<script lang="ts">
import { Map as MapIcon, Trash2 } from "@lucide/svelte";
import { Button } from "@sendou/components";
import ConfirmDialog from "#lib/components/ConfirmDialog.svelte";
import SecondaryAction from "#lib/components/match-page/SecondaryAction.svelte";
import { m } from "#lib/paraglide/messages.js";
import { removeMapList, type ScrimPageData } from "../scrims.remote.ts";
import type { ScrimSide } from "../scrims-types.ts";
import ScrimMapListForm from "./ScrimMapListForm.svelte";

interface Props {
	data: ScrimPageData;
	viewerSide: ScrimSide;
	standalone?: boolean;
}

let { data, viewerSide, standalone }: Props = $props();

const ownList = $derived(
	data.mapByMap.mapLists.find((list) => list.side === viewerSide),
);
// svelte-ignore state_referenced_locally -- whether the manager starts open is decided once at mount
let isOpen = $state(!ownList);

const sides: ScrimSide[] = ["ALPHA", "BRAVO"];

function sideLabel(side: ScrimSide) {
	return side === "ALPHA" ? m.q_match_sides_alpha() : m.q_match_sides_bravo();
}
</script>

<SecondaryAction
	{isOpen}
	onOpenChange={(open) => {
		isOpen = open;
	}}
	collapsedLabel={m.scrims_mapByMap_manageMapLists()}
	{standalone}
>
	{#snippet collapsedIcon()}<MapIcon size={16} />{/snippet}
	<div class="root">
		{#if !ownList}
			<ScrimMapListForm {data} />
		{/if}
		<div class="mapListsSummary">
			{#each sides as side (side)}
				{@const list = data.mapByMap.mapLists.find(
					(candidate) => candidate.side === side,
				)}
				{@const isOwn = side === viewerSide}
				<div class="mapListRow" data-testid={`map-list-row-${side}`}>
					<div class="mapListRowHeader">{sideLabel(side)}</div>
					<div class="mapListBody">
						{#if list}
							{#if list.tournament}
								<span>{list.tournament.name}</span>
							{:else}
								<span>
									{m.scrims_mapByMap_poolList({ count: list.mapList.length })}
								</span>
							{/if}
							{#if isOwn}
								<ConfirmDialog
									dialogHeading={m.scrims_mapByMap_removeListConfirm()}
									submitButtonText={m.common_actions_remove()}
									onConfirm={() =>
										removeMapList({ scrimPostId: data.post.id })}
								>
									{#snippet trigger(triggerProps)}
										<Button
											variant="minimal-destructive"
											size="miniscule"
											aria-label={m.scrims_mapByMap_removeList()}
											{...triggerProps}
										>
											{#snippet icon()}<Trash2 size={16} />{/snippet}
										</Button>
									{/snippet}
								</ConfirmDialog>
							{/if}
						{:else}
							<span class="mapListRowMissing">
								{m.scrims_mapByMap_noListYet()}
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</SecondaryAction>

<style>
	.root {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		align-items: stretch;
		width: 100%;
		container-type: inline-size;
	}

	.mapListsSummary {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}

	.mapListRow {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-2);
	}

	.mapListRowHeader {
		font-weight: var(--weight-bold);
	}

	.mapListBody {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.mapListRowMissing {
		font-style: italic;
		color: var(--color-text-high);
	}
</style>
