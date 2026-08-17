<script module lang="ts">
import type { ModeShort, StageId } from "@sendou/in-game-lists/types";
import type { CommonUser } from "#lib/server/kysely.ts";

// xxx: the ingested-scoreboard section (per-map stats tables + game timeline
// charts), weapon pools, pick/ban rows and SP change rows are not ported yet —
// the scrims usage never reaches them (sendouq/tournament/scanner-only)

type MatchSide = "ALPHA" | "BRAVO";

export interface TimelineTeam {
	name: string;
	avatar?: string;
}

export interface TimelineMap {
	stageId: StageId;
	mode: ModeShort;
	timestamp: number;
	winner: MatchSide;
	rosters: {
		alpha: CommonUser[];
		bravo: CommonUser[];
	};
	/** Whether the game ended in a knockout. Undefined if not collected. */
	ko?: boolean;
}

export interface MatchTimelineProps {
	teams: { alpha: TimelineTeam; bravo: TimelineTeam };
	score?: { alpha: number; bravo: number };
	maps: TimelineMap[];
	/** When true, render only the team + score header (no per-map rows). */
	compact?: boolean;
	/** When true, the match is still in progress; renders a small LIVE label under the score. */
	isOngoing?: boolean;
}
</script>

<script lang="ts">
import { RefreshCcw } from "@lucide/svelte";
import { Button, Popover } from "@sendou/components";
import { shortStageName } from "@sendou/in-game-lists/stage-ids";
import type { Snippet } from "svelte";
import Avatar from "#lib/components/Avatar.svelte";
import LocaleTime from "#lib/components/LocaleTime.svelte";
import ModeImage from "#lib/components/ModeImage.svelte";
import StageImage from "#lib/components/StageImage.svelte";
import { stageName } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import {
	type InferredSubstitution,
	inferSubstitutions,
} from "./match-page-utils.ts";

const LONG_TEAM_NAME_THRESHOLD = 16;

let {
	teams,
	score,
	maps,
	compact = false,
	isOngoing = false,
}: MatchTimelineProps = $props();
</script>

<div class="root">
	{@render timelineHeader()}
	{#if !compact}
		{#each maps as map, i (`${map.timestamp}-${i}`)}
			{@const previousMap = maps[i - 1]}
			{@const substitutions = previousMap
				? inferSubstitutions(previousMap.rosters, map.rosters)
				: []}
			<div class="contents">
				{#each substitutions as substitution (`${substitution.playerOut.id}-${substitution.playerIn.id}`)}
					{@render timelineSubstitutionRow(substitution)}
				{/each}
				{@render timelineMapRow(map)}
			</div>
		{/each}
	{/if}
</div>

{#snippet timelineHeader()}
	{@const initialRosters = maps[0]?.rosters}
	<div class="header">
		<div class="headerTeam">
			<div
				class={[
					"headerTeamName",
					{
						headerTeamNameLong:
							teams.alpha.name.length > LONG_TEAM_NAME_THRESHOLD,
					},
				]}
			>
				{teams.alpha.name}
			</div>
			{#if initialRosters}
				<div class="headerAvatars">
					{#each initialRosters.alpha as user (user.id)}
						<Avatar {user} size="xxs" />
					{/each}
				</div>
			{/if}
		</div>
		<div class="headerScore">
			{#if score}
				<span class="headerScoreValue">
					{score.alpha}-{score.bravo}
				</span>
			{/if}
			{#if isOngoing}
				<span class="headerScoreLive">
					{m.q_match_timeline_ongoing()}
				</span>
			{/if}
		</div>
		<div class="headerTeam headerTeamBravo">
			<div
				class={[
					"headerTeamName",
					{
						headerTeamNameLong:
							teams.bravo.name.length > LONG_TEAM_NAME_THRESHOLD,
					},
				]}
			>
				{teams.bravo.name}
			</div>
			{#if initialRosters}
				<div class="headerAvatars">
					{#each initialRosters.bravo as user (user.id)}
						<Avatar {user} size="xxs" />
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet timelineMapRow(map: TimelineMap)}
	<div class="mapEvent">
		<div class="mapSide">
			{@render sideResult(
				map.winner === "ALPHA" ? "WIN" : "LOSS",
				map.ko && map.winner === "ALPHA",
			)}
		</div>
		<div class="mapCenter">
			<LocaleTime
				date={new Date(map.timestamp)}
				options={{ hour: "numeric", minute: "numeric" }}
				class="mapTimestamp"
			/>
			<StageImage stageId={map.stageId} width={80} class="mapStageImage" />
			<div class="mapLabel">
				<ModeImage mode={map.mode} size={14} />
				<span>{shortStageName(stageName(map.stageId))}</span>
			</div>
		</div>
		<div class="mapSide mapSideBravo">
			{@render sideResult(
				map.winner === "BRAVO" ? "WIN" : "LOSS",
				map.ko && map.winner === "BRAVO",
			)}
		</div>
	</div>
{/snippet}

{#snippet sideResult(result: "WIN" | "LOSS", isKo: boolean | undefined)}
	<div class="sideResult">
		<div class="resultHeaderGroup">
			<div class="resultHeader">
				<span
					class={[
						"resultLabel",
						result === "WIN" ? "text-success" : "text-error",
					]}
				>
					{result === "WIN"
						? m.q_match_timeline_win()
						: m.q_match_timeline_loss()}
				</span>
				{#if isKo}
					<span class="resultPoints">{m.q_match_action_ko()}</span>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet explainerIcon(icon: Snippet, description: string)}
	<Popover>
		{#snippet trigger(triggerProps)}
			<Button
				variant="minimal"
				class="explainerTrigger"
				aria-label={description}
				{...triggerProps}
			>
				{@render icon()}
			</Button>
		{/snippet}
		{description}
	</Popover>
{/snippet}

{#snippet substitutionIcon()}
	<RefreshCcw size={32} class="eventIcon" />
{/snippet}

{#snippet timelineSubstitutionRow(substitution: InferredSubstitution)}
	<div class="eventRow">
		<div class="eventAlpha">
			{#if substitution.side === "ALPHA"}
				{@render substitutionDetail(substitution)}
			{/if}
		</div>
		<div class="subCenter">
			{@render explainerIcon(
				substitutionIcon,
				m.q_match_timeline_explainer_substitution(),
			)}
		</div>
		<div>
			{#if substitution.side === "BRAVO"}
				{@render substitutionDetail(substitution)}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet substitutionDetail(substitution: InferredSubstitution)}
	<div class="subDetail">
		<span class="subLabelOut">{m.q_match_timeline_out()}</span>
		<div class="stack horizontal items-center sm">
			<Avatar user={substitution.playerOut} size="xxxs" />
			<span class="subPlayerName">
				{substitution.playerOut.username}
			</span>
		</div>
		<span class="subLabelIn">{m.q_match_timeline_in()}</span>
		<div class="stack horizontal items-center sm">
			<Avatar user={substitution.playerIn} size="xxxs" />
			<span class="subPlayerName">
				{substitution.playerIn.username}
			</span>
		</div>
	</div>
{/snippet}

<style>
	.root {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		row-gap: var(--s-6);
		column-gap: var(--s-4);
		align-items: center;
		width: 100%;
	}

	.header {
		display: contents;
	}

	.headerTeam {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--s-1-5);
	}

	.headerTeamBravo {
		align-items: flex-start;
	}

	.headerTeamName {
		font-weight: var(--weight-bold);
		font-size: var(--font-md);
		text-box: trim-start cap alphabetic;
		overflow-wrap: anywhere;
	}

	.headerTeamNameLong {
		font-size: var(--font-xs);
	}

	.headerAvatars {
		display: flex;
		gap: var(--s-1);
	}

	.headerScore {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.headerScoreValue {
		font-size: var(--font-xl);
		font-weight: var(--weight-extra);
		line-height: 1;
	}

	.headerScoreLive {
		margin-top: var(--s-1);
		font-size: var(--font-3xs);
		font-weight: var(--weight-bold);
		letter-spacing: 0.1em;
		color: var(--color-error);
	}

	.mapEvent {
		display: contents;
	}

	.mapSide {
		display: grid;
		grid-template-rows: auto 1fr auto;
		align-self: stretch;
		container: weapon-pool / inline-size;
	}

	.mapCenter {
		display: grid;
		grid-template-rows: auto 1fr auto;
		justify-items: center;
		gap: var(--s-1);
	}

	.mapCenter :global(.mapTimestamp) {
		font-size: var(--font-3xs);
		color: var(--color-text-high);
		font-weight: var(--weight-semi);
	}

	.mapCenter :global(.mapStageImage) {
		border-radius: var(--radius-box);
	}

	.mapLabel {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		font-size: var(--font-3xs);
		font-weight: var(--weight-semi);
		color: var(--color-text-high);
	}

	.sideResult {
		grid-row: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--s-2-5);

		.mapSideBravo & {
			justify-self: start;
		}

		.mapSide:not(.mapSideBravo) & {
			justify-self: end;
		}
	}

	.resultHeaderGroup {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-0-5);
	}

	.resultHeader {
		display: flex;
		align-items: baseline;
		gap: var(--s-1);
	}

	.resultLabel {
		font-size: var(--font-sm);
		font-weight: var(--weight-extra);
		text-transform: uppercase;
	}

	.resultPoints {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		color: var(--color-text);
	}

	.eventRow {
		display: contents;
	}

	.eventAlpha {
		justify-self: end;
	}

	.subCenter {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.subCenter :global(.eventIcon) {
		color: var(--color-text-high);
		background-color: var(--color-bg-higher);
		border-radius: var(--radius-full);
		padding: var(--s-1);
	}

	.subCenter :global(.explainerTrigger) {
		display: flex;
		align-items: center;
		justify-content: center;
		height: auto;
		width: auto;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
		border-radius: var(--radius-full);
		cursor: pointer;
	}

	.subDetail {
		display: grid;
		grid-template-columns: max-content 1fr;
		align-items: center;
		row-gap: var(--s-1);
		column-gap: var(--s-3);
	}

	.subLabelOut {
		color: var(--color-error);
		font-weight: var(--weight-bold);
		font-size: var(--font-3xs);
		text-transform: uppercase;
	}

	.subLabelIn {
		color: var(--color-success);
		font-weight: var(--weight-bold);
		font-size: var(--font-3xs);
		text-transform: uppercase;
	}

	.subPlayerName {
		font-weight: var(--weight-semi);
		font-size: var(--font-xs);
	}
</style>
