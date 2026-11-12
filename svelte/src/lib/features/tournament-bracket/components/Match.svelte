<!-- A bracket's match card; the CAST, LIVE and VOD buttons of the React card render without their popovers. -->
<script lang="ts" module>
export type LineType = "none" | "straight" | "curve-up" | "curve-down";
</script>

<script lang="ts">
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import type {
	MatchExitDestinations,
	MatchExitGroups,
} from "~/features/tournament-bracket/core/Bracket/Bracket";
import * as Deadline from "~/features/tournament-bracket/core/Deadline";
import { matchEndedEarly } from "~/features/tournament-bracket/core/engine";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { TournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import { databaseTimestampToDate } from "~/utils/dates";
import type { Unpacked } from "~/utils/types";
import { tournamentMatchPage } from "~/utils/urls";
import type { VodsByTournamentId } from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import Avatar from "#lib/components/Avatar.svelte";
import { m } from "#lib/paraglide/messages.js";
import { minuteTicker } from "../minute-ticker.ts";

type MatchData = Unpacked<TournamentData["data"]["match"]>;

interface Props {
	match: MatchData;
	tournament: Tournament;
	/** Of the viewer, for highlighting their team. */
	ownTeamId: number | undefined;
	isPreview?: boolean;
	type?: "winners" | "losers" | "grands" | "groups";
	group?: string;
	roundNumber: number;
	showSimulation: boolean;
	bracket: Bracket;
	hideMatchTimer?: boolean;
	lineType?: LineType;
	lineVerticalExtend?: number;
	spoilerCensor?: "full" | "score-only";
	exitDestinations?: MatchExitDestinations;
	exitGroups?: MatchExitGroups;
	vods: VodsByTournamentId;
}

let {
	match,
	tournament,
	ownTeamId,
	isPreview,
	type,
	group,
	roundNumber,
	showSimulation,
	bracket,
	hideMatchTimer,
	lineType,
	lineVerticalExtend,
	spoilerCensor,
	exitDestinations,
	exitGroups,
	vods,
}: Props = $props();

const isBye = $derived(!match.opponent1 || !match.opponent2);
const round = $derived(bracket.data.round.find((r) => r.id === match.roundId));

const prefix = $derived.by(() => {
	if (type === "winners") return "WB ";
	if (type === "losers") return "LB ";
	if (type === "grands") return "GF ";
	if (type === "groups") return `${group}`;
	return "";
});

const headerButton = $derived.by(() => {
	const isOver = Boolean(match.winnerSide);
	if (!isOver && tournament.isMatchLockedForCast(match.id)) return "🔒 CAST";
	if (hasStreams(isOver) && match.startedAt) return "🔴 LIVE";
	if (isOver && vods.some((vod) => vod.matchId === match.id)) return "📺 VOD";
	return null;
});

const lineStyle = $derived(
	lineVerticalExtend ? `--bracket-vertical-extend: ${lineVerticalExtend}px` : undefined,
);

const timer = $derived.by(() => {
	if (hideMatchTimer || bracket.hasScheduling || !match.startedAt) return null;
	if (match.winnerSide) return null;
	if (tournament.isMatchLockedForCast(match.id)) return null;
	const bestOf = round?.maps?.count;
	if (!bestOf) return null;

	return {
		startedAt: databaseTimestampToDate(match.startedAt),
		gamesCompleted:
			(match.opponent1?.score ?? 0) + (match.opponent2?.score ?? 0),
		bestOf,
	};
});

const exitRows = $derived.by(() => {
	if (!exitDestinations) return null;

	const exitRow = (rowType: "winner" | "loser", bracketIdx: number | null) => ({
		type: rowType,
		bracketIdx,
		groupId: exitGroups?.[rowType] ?? undefined,
		bracketName:
			bracketIdx === null ? null : tournament.bracketsMeta[bracketIdx]?.name,
		isLinkable: tournament.visibleBracketsMeta.some(
			(meta) => meta.idx === bracketIdx,
		),
	});

	const winner = exitRow("winner", exitDestinations.winner);
	const loser = exitRow("loser", exitDestinations.loser);
	const hasLine = Boolean(lineType) && lineType !== "none";

	return (match.winnerSide === "opponent2" ? [loser, winner] : [winner, loser]).filter(
		(row) => hasLine || row.bracketName,
	);
});

function hasStreams(isOver: boolean) {
	if (isOver || !match.opponent1?.id || !match.opponent2?.id) return false;
	if (
		tournament.ctx.castedMatchesInfo?.castedMatches.some(
			(cm) => cm.matchId === match.id,
		)
	) {
		return true;
	}

	const matchParticipants = [match.opponent1.id, match.opponent2.id].flatMap(
		(teamId) => tournament.teamById(teamId)?.memberUserIds ?? [],
	);

	return tournament.streamingParticipantIds.some((p) =>
		matchParticipants.includes(p),
	);
}

function row(side: 1 | 2) {
	const opponentKey = `opponent${side}` as const;
	const opponent = match[opponentKey];

	const score = (() => {
		if (spoilerCensor) return null;
		if (!match.opponent1?.id || !match.opponent2?.id || isPreview) return null;

		// W/L as the score might not reflect the winner set in the early ending
		if (
			round?.maps &&
			matchEndedEarly({
				opponentOne: match.opponent1,
				opponentTwo: match.opponent2,
				winnerSide: match.winnerSide,
				count: round.maps.count,
				countType: round.maps.type,
			})
		) {
			return match.winnerSide === opponentKey ? "W" : "L";
		}

		return opponent!.score ?? 0;
	})();

	const isLoser =
		spoilerCensor || !match.winnerSide ? false : match.winnerSide !== opponentKey;

	const { team, simulated } = (() => {
		if (opponent?.id) {
			return { team: tournament.teamById(opponent.id), simulated: false };
		}

		const simulatedOpponent = showSimulation
			? bracket.simulatedMatch(match.id)?.[opponentKey]
			: undefined;

		return simulatedOpponent?.id
			? { team: tournament.teamById(simulatedOpponent.id), simulated: true }
			: { team: null, simulated: true };
	})();

	const showAvatar = spoilerCensor === "full" ? false : !simulated && Boolean(team);
	const isBigSeedNumber =
		spoilerCensor === "full" ? false : Boolean(team?.seed && team.seed > 99);

	return {
		score,
		isLoser,
		team,
		simulated,
		showAvatar,
		isBigSeedNumber,
		displayedSeed: spoilerCensor === "full" ? null : team?.seed,
		displayedName: spoilerCensor === "full" ? "???" : (team?.name ?? "???"),
		isOwnTeam: !simulated && ownTeamId !== undefined && ownTeamId === team?.id,
	};
}
</script>

{#snippet matchLine()}
	{#if lineType && lineType !== "none"}
		<div
			class={[
				"match-line-container",
				lineType === "straight"
					? "match-line-straight"
					: lineType === "curve-up"
						? "match-line-curve-up"
						: "match-line-curve-down",
			]}
			style={lineStyle}
			data-line-type={lineType}
		>
			{#if lineType === "curve-down"}
				<div class="match-line-connector-down" style={lineStyle}></div>
			{/if}
			{#if lineType === "curve-up"}
				<div class="match-line-connector-up" style={lineStyle}></div>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet matchRow(side: 1 | 2)}
	{@const r = row(side)}
	<div
		class={["stack horizontal", r.isLoser && "text-lighter"]}
		data-participant-id={r.team?.id}
	>
		<div
			class={[
				"match-seed",
				r.simulated && "text-lighter italic opaque",
				r.isBigSeedNumber && "match-seed-wide",
			]}
		>
			{r.displayedSeed}
		</div>
		{#if r.showAvatar}
			<Avatar
				size="xxxs"
				url={r.team!.logoUrl}
				identiconInput={r.team!.name}
				class="mr-1"
			/>
		{/if}
		<div
			class={[
				"match-team-name",
				"truncate",
				r.isOwnTeam && "text-theme-secondary",
				r.simulated && "text-lighter italic opaque",
				(r.showAvatar || r.isBigSeedNumber) &&
					!(r.showAvatar && r.isBigSeedNumber) &&
					"match-team-name-narrow",
				r.showAvatar && r.isBigSeedNumber && "match-team-name-narrowest",
				!r.team && "invisible",
			]}
			data-testid="match-team-name"
		>
			{r.displayedName}
		</div>{" "}
		<div class="match-score" data-testid="match-score">{r.score}</div>
	</div>
{/snippet}

{#if isBye}
	<div class="match-bye match-wrapper" data-testid="match-bye">
		{@render matchLine()}
	</div>
{:else}
	<div class="match-wrapper" data-testid="match-wrapper">
		<div class="match-header">
			<div class="match-header-box" data-testid="match-header-box">
				{prefix}{roundNumber}.{match.number}
			</div>
			{#if headerButton}
				<button type="button" class="match-header-box match-header-box-button">
					{headerButton}
				</button>
			{/if}
		</div>
		{#if isPreview}
			<div class="match">
				{@render matchRow(1)}
				<div class="match-separator"></div>
				{@render matchRow(2)}
			</div>
		{:else}
			<a
				class="match"
				href={tournamentMatchPage({
					tournamentId: tournament.ctx.id,
					matchId: match.id,
				})}
				data-match-id={match.id}
			>
				{@render matchRow(1)}
				<div class="match-separator"></div>
				{@render matchRow(2)}
			</a>
		{/if}
		{#if timer}
			{@render matchTimer(timer)}
		{/if}
		{#if exitRows}
			<div
				class={["match-exits", exitRows.length === 1 && "match-exits-single"]}
				data-testid="match-exits"
			>
				{#each exitRows as exit (exit.type)}
					{#if !exit.bracketName}
						<div class="match-exit-row"></div>
					{:else}
						{@const title =
							exit.type === "winner"
								? m.tournament_bracket_exit_winner({ bracket: exit.bracketName })
								: m.tournament_bracket_exit_loser({ bracket: exit.bracketName })}
						{@const label = `${exit.bracketName} ${exit.type === "winner" ? "[W]" : "[L]"}`}
						<div class="match-exit-row">
							<span class="match-exit-dots" aria-hidden="true"></span>
							{#if exit.isLinkable && exit.bracketIdx !== null}
								<a
									href={tournamentBracketsPage({
										tournamentId: tournament.ctx.id,
										bracketIdx: exit.bracketIdx,
										groupId: exit.groupId,
									})}
									class="match-exit"
									{title}
								>
									{label}
								</a>
							{:else}
								<span class="match-exit" {title}>{label}</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
		{@render matchLine()}
	</div>
{/if}

{#snippet matchTimer({
	startedAt,
	gamesCompleted,
	bestOf,
}: {
	startedAt: Date;
	gamesCompleted: number;
	bestOf: number;
})}
	{@const elapsedMinutes = Math.floor(
		(minuteTicker.now.getTime() - startedAt.getTime()) / 60_000,
	)}
	{@const status = Deadline.matchStatus({
		elapsedMinutes,
		gamesCompleted,
		maxGamesCount: bestOf,
	})}
	<div class="match-timer" data-testid="bracket-match-timer">
		<div
			class={[
				"match-header-box",
				"match-header-box-button",
				status === "warning" && "match-timer-warning",
				status === "error" && "match-timer-error",
			]}
		>
			{elapsedMinutes >= 60 ? "1h+" : `${elapsedMinutes}m`}
		</div>
	</div>
{/snippet}

<style>
	@layer features {
		.match-header {
			position: absolute;
			display: flex;
			justify-content: space-between;
			width: var(--match-width);
			margin-block-start: calc(var(--selector-size-xs) * -1);
		}

		.match-header-box {
			background-color: var(--color-bg-higher);
			padding: 0 var(--s-1);
			height: var(--selector-size-xs);
			display: flex;
			align-items: center;
			border-radius: var(--radius-selector);
			font-size: var(--font-2xs) !important;
			font-weight: var(--weight-semi);
			color: var(--color-text);
			border: 0;
		}

		.match-header-box-button {
			height: 18.86px;
		}

		.match-timer {
			position: absolute;
			top: 50%;
			left: 0;
			transform: translate(-100%, -50%);
			margin-inline-start: 8px;
		}

		.match-timer-warning {
			background-color: var(--color-warning);
			color: var(--color-text-on-light);
		}

		.match-timer-error {
			background-color: var(--color-error);
			color: inherit;
		}

		.match {
			width: var(--match-width);
			min-height: var(--match-height);
			max-height: var(--match-height);
			border-radius: var(--radius-field);
			background-color: var(--color-bg-high);
			font-size: var(--font-2xs);
			font-weight: var(--weight-semi);
			padding: 0 var(--s-2);
			display: flex;
			flex-direction: column;
			gap: var(--s-1);
			color: var(--color-text);
			justify-content: center;
			transition: background-color 0.2s;
		}

		a.match:hover {
			background-color: var(--color-bg-high);
			border-radius: var(--radius-field);
		}

		.match-separator {
			min-height: 2px;
			max-height: 2px;
			width: 100%;
			background-color: var(--color-bg-higher);
		}

		.match-bye {
			visibility: hidden;
			min-height: var(--match-height);
			max-height: var(--match-height);
		}

		.match-seed {
			color: var(--color-fg-accent);
			margin-inline-end: var(--s-0-5);
			min-width: 15px;
			max-width: 15px;
		}

		.match-seed-wide {
			min-width: 22px;
			max-width: 22px;
		}

		.match-team-name {
			max-width: 95px;
		}

		.match-team-name-narrow {
			max-width: 75px;
		}

		.match-team-name-narrowest {
			max-width: 70px;
		}

		.match-score {
			margin-inline-start: auto;
		}

		.match-wrapper {
			position: relative;
			width: var(--match-width);
			height: var(--match-height);
		}

		.match-line-container {
			position: absolute;
			top: 0;
			left: 100%;
			width: calc(var(--line-width) + var(--exit-width, 0px));
			height: 100%;
			pointer-events: none;
		}

		.match-line-straight::before {
			content: "";
			position: absolute;
			top: 50%;
			left: 0;
			width: 100%;
			height: 2px;
			background: var(--color-border);
			transform: translateY(-50%);
		}

		.match-line-curve-down::before,
		.match-line-curve-up::before {
			content: "";
			position: absolute;
			top: 50%;
			left: 0;
			width: calc(100% - var(--line-width) / 2);
			height: 2px;
			background: var(--color-border);
			transform: translateY(-50%);
		}

		.match-line-curve-down::after {
			content: "";
			position: absolute;
			top: 50%;
			left: calc(100% - var(--line-width) / 2 - 1px);
			width: 2px;
			height: calc(50% + var(--bracket-vertical-extend, 50px));
			background: var(--color-border);
		}

		.match-line-curve-up::after {
			content: "";
			position: absolute;
			bottom: 50%;
			left: calc(100% - var(--line-width) / 2 - 1px);
			width: 2px;
			height: calc(50% + var(--bracket-vertical-extend, 50px));
			background: var(--color-border);
		}

		.match-line-connector-down {
			position: absolute;
			top: calc(100% + var(--bracket-vertical-extend, 50px) - 1px);
			left: calc(100% - var(--line-width) / 2 - 1px);
			width: calc(var(--line-width) / 2 + 1px);
			height: 2px;
			background: var(--color-border);
		}

		.match-line-connector-up {
			position: absolute;
			bottom: calc(100% + var(--bracket-vertical-extend, 50px) - 1px);
			left: calc(100% - var(--line-width) / 2 - 1px);
			width: calc(var(--line-width) / 2 + 1px);
			height: 2px;
			background: var(--color-border);
		}

		.match-exits {
			position: absolute;
			top: 0;
			left: 100%;
			display: grid;
			grid-template-rows: 1fr 1fr;
			width: calc(var(--exit-width, 0px) - var(--s-2));
			height: 100%;
		}

		.match-exits-single {
			grid-template-rows: 1fr;
		}

		.match-exit-row {
			display: flex;
			align-items: center;
			min-width: 0;
		}

		.match-exit-dots {
			flex: 0 0 var(--s-5);
			margin-inline: var(--s-1);
			border-block-start: 3px dotted var(--color-border);
		}

		.match-exit {
			min-width: 0;
			font-size: var(--font-2xs);
			font-weight: var(--weight-semi);
			color: var(--color-text-high);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;

			&:is(a):hover {
				color: var(--color-text);
				text-decoration: underline;
			}
		}
	}
</style>
