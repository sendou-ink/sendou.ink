<script module lang="ts">
import type { CommonUser } from "#lib/server/kysely.ts";
import type { MatchTimelineProps } from "./MatchTimeline.svelte";

export interface ActionTabTeam {
	id: number;
	name: string;
	avatar?: string;
}

export interface SetEndingData extends MatchTimelineProps {
	score: { alpha: number; bravo: number };
	currentRosters: { alpha: CommonUser[]; bravo: CommonUser[] };
	setEndingTeamIds: number[];
}
</script>

<script lang="ts">
import { Check } from "@lucide/svelte";
import { Button, TabPanel } from "@sendou/components";
import { shortStageName } from "@sendou/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "@sendou/in-game-lists/types";
import type { Snippet } from "svelte";
import { WebHaptics } from "web-haptics";
import Avatar from "#lib/components/Avatar.svelte";
import ModeImage from "#lib/components/ModeImage.svelte";
import StageImage from "#lib/components/StageImage.svelte";
import { stageName } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import { TAB_KEYS } from "./match-page-constants.ts";
import MatchTimeline, { type TimelineMap } from "./MatchTimeline.svelte";

const LONG_TEAM_NAME_THRESHOLD = 16;

interface Props {
	teams: [ActionTabTeam, ActionTabTeam];
	ownTeamId: number | null;
	stageId: StageId;
	mode: ModeShort;
	withKo: boolean;
	onSubmit?: (data: { winnerId: number; ko?: boolean }) => void;
	isSubmitting?: boolean;
	setEnding?: SetEndingData;
	actionButtons?: Snippet;
	secondaryAction?: Snippet;
}

let {
	teams,
	ownTeamId,
	stageId,
	mode,
	withKo,
	onSubmit,
	isSubmitting,
	setEnding,
	actionButtons,
	secondaryAction,
}: Props = $props();

const uid = $props.id();
const haptics = new WebHaptics();

let winnerId = $state<number | null>(null);
let isKo = $state(false);
let confirming = $state(false);

const canSubmit = $derived(winnerId !== null);
const isOnTeam = $derived(
	ownTeamId != null &&
		(teams[0].id === ownTeamId || teams[1].id === ownTeamId),
);

function selectWinner(selectedId: number) {
	winnerId = selectedId;

	const isEnemySelection = isOnTeam && selectedId !== ownTeamId;
	if (isEnemySelection) {
		void haptics.trigger([
			{ duration: 40, intensity: 0.7 },
			{ delay: 40, duration: 40, intensity: 0.7 },
			{ delay: 40, duration: 40, intensity: 0.9 },
			{ delay: 40, duration: 50, intensity: 0.6 },
		]);
	} else {
		void haptics.trigger([
			{ duration: 30 },
			{ delay: 60, duration: 40, intensity: 1 },
		]);
	}
}

function submit() {
	if (winnerId === null) return;
	onSubmit?.({ winnerId, ko: withKo ? isKo : undefined });
}

function onSubmitPress() {
	if (winnerId === null) return;
	if (setEnding?.setEndingTeamIds.includes(winnerId)) {
		confirming = true;
	} else {
		submit();
	}
}
</script>

<TabPanel id={TAB_KEYS.ACTION}>
	{#if confirming && winnerId !== null && setEnding}
		{@render setEndingConfirmation(winnerId, setEnding)}
	{:else}
		<div class={["root", { withKo }]}>
			<div class="title">{m.q_match_action_selectWinner()}</div>
			{#if actionButtons}
				<div class="actionButtons">{@render actionButtons()}</div>
			{/if}

			<div
				role="radiogroup"
				aria-label={m.q_match_action_selectWinner()}
				class="selectionRow"
			>
				{@render teamRadioOption(teams[0], "alpha", "winner-radio-1")}
				<StageImage
					{stageId}
					width={90}
					class="stageImage"
					containerClass="stageImageWrapper"
				/>
				<div class="stageLabel">
					<ModeImage {mode} size={14} />
					<span>{shortStageName(stageName(stageId))}</span>
				</div>
				{@render teamRadioOption(teams[1], "bravo", "winner-radio-2")}
			</div>

			{#if withKo}
				<div class="ko">
					<label class="koLabel">
						<input
							type="checkbox"
							bind:checked={isKo}
							data-testid="ko-checkbox"
						/>
						{m.q_match_action_ko()}
					</label>
				</div>
			{/if}

			<Button
				variant="primary"
				disabled={!canSubmit || isSubmitting}
				onclick={onSubmitPress}
				class="submit"
				testId="report-score-button"
			>
				{m.common_actions_submit()}
			</Button>
		</div>
	{/if}
	{@render secondaryAction?.()}
</TabPanel>

{#snippet setEndingConfirmation(
	confirmedWinnerId: number,
	setEndingData: SetEndingData,
)}
	{@const winnerSide = confirmedWinnerId === teams[0].id ? "ALPHA" : "BRAVO"}
	{@const newMap = {
		stageId,
		mode,
		timestamp: Date.now(),
		winner: winnerSide,
		rosters: setEndingData.currentRosters,
		ko: withKo ? isKo : undefined,
	} satisfies TimelineMap}
	{@const updatedScore = {
		alpha: setEndingData.score.alpha + (winnerSide === "ALPHA" ? 1 : 0),
		bravo: setEndingData.score.bravo + (winnerSide === "BRAVO" ? 1 : 0),
	}}
	<div class="confirmationRoot">
		<div class="confirmationMessage">
			{m.q_match_action_confirmSetEnding()}
		</div>
		<MatchTimeline
			teams={setEndingData.teams}
			score={updatedScore}
			maps={[...setEndingData.maps, newMap]}
		/>
		<div class="confirmationButtons">
			<Button
				variant="primary"
				disabled={isSubmitting}
				onclick={submit}
				testId="confirm-set-end-button"
			>
				{m.common_actions_confirm()}
			</Button>
			<Button variant="outlined" onclick={() => (confirming = false)}>
				{m.common_actions_back()}
			</Button>
		</div>
	</div>
{/snippet}

{#snippet teamRadioOption(
	team: ActionTabTeam,
	areaClass: "alpha" | "bravo",
	testId: string,
)}
	{@const isSelected = winnerId === team.id}
	{@const isOwnTeam = team.id === ownTeamId}
	{@const hideLabel = ownTeamId === null}
	{@const isLongName = team.name.length > LONG_TEAM_NAME_THRESHOLD}
	<label
		class={["teamRadioContainer", areaClass]}
		data-testid={testId}
		data-selected={isSelected ? "true" : undefined}
	>
		<input
			type="radio"
			class="srOnly"
			name="{uid}-winner"
			value={String(team.id)}
			checked={isSelected}
			disabled={isSubmitting}
			aria-label={team.name}
			onchange={() => selectWinner(team.id)}
		/>
		<span class={["teamRadio", { selected: isSelected }]}>
			<span class={["checkCircle", { checkCircleSelected: isSelected }]}>
				{#if isSelected}<Check size={14} />{/if}
			</span>
			<span class="teamAvatarInfo">
				<Avatar url={team.avatar} identiconInput={team.name} size="xxs" />
				<span class="teamInfo">
					<span class={["teamName", { teamNameLong: isLongName }]}>
						{team.name}
					</span>
					{#if !hideLabel}
						<span
							class={[
								"teamLabel",
								isOwnTeam ? "myTeamLabel" : "opponentLabel",
							]}
						>
							{isOwnTeam
								? m.q_match_action_myTeam()
								: m.q_match_action_opponent()}
						</span>
					{/if}
				</span>
			</span>
		</span>
	</label>
{/snippet}

<style>
	.root {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		grid-template-areas:
			"header header header"
			"actions actions actions"
			"selection selection selection"
			"submit submit submit";
		justify-items: center;
		align-items: center;
		gap: var(--s-5);
		container-type: inline-size;

		@container (max-width: 599px) {
			grid-template-columns: 1fr;
			grid-template-areas:
				"header"
				"actions"
				"selection"
				"submit";
		}
	}

	.withKo {
		grid-template-areas:
			"header header header"
			"actions actions actions"
			"selection selection selection"
			"ko ko ko"
			"submit submit submit";

		@container (max-width: 599px) {
			grid-template-areas:
				"header"
				"actions"
				"selection"
				"ko"
				"submit";
		}
	}

	.title {
		grid-area: header;
		font-size: var(--font-md);
		font-weight: var(--weight-semi);
		text-align: center;
		text-box: trim-start cap alphabetic;
	}

	.actionButtons {
		grid-area: actions;
		display: flex;
		gap: var(--s-6);
		margin-block-start: calc(-1 * var(--s-4));
	}

	.selectionRow {
		grid-area: selection;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		grid-template-areas:
			"alpha stage bravo"
			".     text  .";
		column-gap: var(--s-4);
		row-gap: var(--s-1);
		justify-items: center;
		align-items: center;
		width: 100%;

		@container (max-width: 599px) {
			column-gap: var(--s-2);
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas:
				"stage alpha"
				"stage bravo"
				"text  .";
		}
	}

	.teamRadioContainer {
		--label-margin: 0;
		width: 100%;
		height: 100%;
		max-width: 250px;

		@container (max-width: 599px) {
			max-width: unset;
		}
	}

	.alpha {
		grid-area: alpha;
		justify-self: end;

		@container (max-width: 599px) {
			justify-self: stretch;
			align-self: end;
		}
	}

	.bravo {
		grid-area: bravo;
		justify-self: start;

		@container (max-width: 599px) {
			justify-self: stretch;
			align-self: start;
		}
	}

	.selectionRow :global(.stageImageWrapper) {
		grid-area: stage;

		@container (max-width: 599px) {
			align-self: stretch;
			width: 90px;
		}
	}

	.selectionRow :global(.stageImage) {
		border-radius: var(--radius-box);
		display: block;

		@container (max-width: 599px) {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
	}

	.stageLabel {
		grid-area: text;
		display: flex;
		align-items: center;
		gap: var(--s-1);
		font-size: var(--font-3xs);
		font-weight: var(--weight-semi);
		color: var(--color-text-high);
	}

	.ko {
		grid-area: ko;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
	}

	.root :global(.submit) {
		grid-area: submit;
	}

	.checkCircle {
		width: 24px;
		height: 24px;
		border-radius: 100%;
		border: 2px solid var(--color-border-high);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.teamRadio {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-1-5) var(--s-3);
		border-radius: var(--radius-field);
		border: 2px solid var(--color-border);
		cursor: pointer;
		background-color: var(--color-bg-high);
		min-width: 160px;
		transition: background-color 0.15s;
		height: 100%;

		&:hover .checkCircle {
			border-color: var(--color-accent-high);
		}

		@container (max-width: 599px) {
			min-width: unset;
		}
	}

	.selected {
		background-color: var(--color-bg-higher);
	}

	.teamRadioContainer:has(input:focus-visible) .teamRadio {
		outline: var(--focus-ring);
	}

	.srOnly {
		border: 0;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		height: 1px;
		margin: -1px;
		overflow: hidden;
		padding: 0;
		position: absolute;
		width: 1px;
		white-space: nowrap;
	}

	.teamAvatarInfo {
		display: flex;
		align-items: center;
		gap: var(--s-1-5);
		min-width: 0;
	}

	.checkCircleSelected {
		background-color: var(--color-accent-high);
		border-color: var(--color-accent-high);
		color: var(--color-text-inverse);

		& :global(svg) {
			stroke-width: 3px;
		}
	}

	.teamInfo {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
		min-width: 0;
	}

	.teamName {
		font-weight: var(--weight-semi);
		font-size: var(--font-sm);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.teamNameLong {
		font-size: var(--font-2xs);
	}

	.teamLabel {
		font-size: var(--font-3xs);
		font-weight: var(--weight-semi);
	}

	.myTeamLabel {
		color: var(--color-success-high);
	}

	.opponentLabel {
		color: var(--color-error-high);
	}

	.koLabel {
		display: flex;
		align-items: center;
		gap: var(--s-1-5);
		font-weight: var(--weight-semi);
		cursor: pointer;
	}

	.confirmationRoot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-4);
	}

	.confirmationMessage {
		font-weight: var(--weight-semi);
		text-align: center;
		color: var(--color-warning);
		margin-block-end: var(--s-4);
	}

	.confirmationButtons {
		display: flex;
		gap: var(--s-3);
		margin-block-start: var(--s-4);
	}
</style>
