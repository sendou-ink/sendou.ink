<script lang="ts">
import { MapPin, Repeat, Undo2 } from "@lucide/svelte";
import { Button, TabPanel } from "@sendou/components";
import MatchActionTab from "#lib/components/match-page/MatchActionTab.svelte";
import { TAB_KEYS } from "#lib/components/match-page/match-page-constants.ts";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { m } from "#lib/paraglide/messages.js";
import * as Scrim from "../Scrim.ts";
import * as ScrimMapByMap from "../ScrimMapByMap.ts";
import { replayMap, reportMap, type ScrimPageData, undoMap } from "../scrims.remote.ts";
import PickMapDialog from "./PickMapDialog.svelte";
import ScrimMapListManager from "./ScrimMapListManager.svelte";

const ALPHA_TEAM_ID = 1;
const BRAVO_TEAM_ID = 2;

interface Props {
	data: ScrimPageData;
}

let { data }: Props = $props();

const user = $derived(loggedInUser());

const viewerSide = $derived(
	user ? Scrim.sideOfUser(data.post, user.id) : null,
);

const currentMap = $derived(data.mapByMap.currentMap);
const acceptedRequest = $derived(
	data.post.requests.find((r) => r.isAccepted),
);

const alphaName = $derived(
	data.post.team ? Scrim.sideDisplayName(data.post) : m.q_match_groupAlpha(),
);
const bravoName = $derived(
	acceptedRequest?.team
		? Scrim.sideDisplayName(acceptedRequest)
		: m.q_match_groupBravo(),
);

let reportPending = $state(false);
let undoPending = $state(false);
let replayPending = $state(false);

const maps = $derived(data.mapByMap.maps);
const latest = $derived(Scrim.lastReportedMap(maps));
const undoAllowed = $derived(ScrimMapByMap.canUndo(latest, maps));
const replayAllowed = $derived(Boolean(latest && currentMap));

async function handleReport(submitted: { winnerId: number }) {
	if (!currentMap) return;

	reportPending = true;
	try {
		await reportMap({
			scrimPostId: data.post.id,
			mapId: currentMap.id,
			winnerSide: submitted.winnerId === ALPHA_TEAM_ID ? "ALPHA" : "BRAVO",
		});
	} finally {
		reportPending = false;
	}
}

async function handleUndo() {
	undoPending = true;
	try {
		await undoMap({ scrimPostId: data.post.id });
	} finally {
		undoPending = false;
	}
}

async function handleReplay() {
	replayPending = true;
	try {
		await replayMap({ scrimPostId: data.post.id });
	} finally {
		replayPending = false;
	}
}
</script>

{#if !data.mapByMap.locked}
	{#if !viewerSide}
		<TabPanel id={TAB_KEYS.ACTION}>
			<div class="locked">
				{m.scrims_mapByMap_nonParticipantNotice()}
			</div>
		</TabPanel>
	{:else if !currentMap}
		<TabPanel id={TAB_KEYS.ACTION}>
			<ScrimMapListManager {data} {viewerSide} standalone />
		</TabPanel>
	{:else}
		{#key currentMap.id}
			<MatchActionTab
				teams={[
					{ id: ALPHA_TEAM_ID, name: alphaName },
					{ id: BRAVO_TEAM_ID, name: bravoName },
				]}
				ownTeamId={viewerSide === "ALPHA" ? ALPHA_TEAM_ID : BRAVO_TEAM_ID}
				stageId={currentMap.stageId}
				mode={currentMap.mode}
				withKo={false}
				isSubmitting={reportPending}
				onSubmit={handleReport}
			>
				{#snippet actionButtons()}
					<Button
						testId="undo-map-button"
						variant="minimal-destructive"
						size="miniscule"
						disabled={!undoAllowed || undoPending}
						onclick={handleUndo}
					>
						{#snippet icon()}<Undo2 size={16} />{/snippet}
						{m.scrims_mapByMap_undo()}
					</Button>
					<Button
						testId="replay-map-button"
						variant="minimal"
						size="miniscule"
						disabled={!replayAllowed || replayPending}
						onclick={handleReplay}
					>
						{#snippet icon()}<Repeat size={16} />{/snippet}
						{m.scrims_mapByMap_replay()}
					</Button>
					{#key `${currentMap.id}-${currentMap.mode}-${currentMap.stageId}`}
						<PickMapDialog
							heading={m.scrims_mapByMap_pickDialog_heading()}
							scrimPostId={data.post.id}
						>
							{#snippet trigger(triggerProps)}
								<Button
									testId="pick-map-button"
									variant="minimal"
									size="miniscule"
									{...triggerProps}
								>
									{#snippet icon()}<MapPin size={16} />{/snippet}
									{m.scrims_mapByMap_pick()}
								</Button>
							{/snippet}
						</PickMapDialog>
					{/key}
				{/snippet}
				{#snippet secondaryAction()}
					<ScrimMapListManager {data} {viewerSide} />
				{/snippet}
			</MatchActionTab>
		{/key}
	{/if}
{/if}

<style>
	.locked {
		padding: var(--s-3);
		border-radius: var(--radius-box);
		background: var(--color-bg-high);
		color: var(--color-text-high);
		text-align: center;
	}
</style>
