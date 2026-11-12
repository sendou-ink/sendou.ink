<script lang="ts">
import * as R from "remeda";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import type { MatchExitGroupsById } from "~/features/tournament-bracket/core/Bracket/Bracket";
import { getRounds } from "~/features/tournament-bracket/core/rounds";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { VodsByTournamentId } from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import Match, { type LineType } from "./Match.svelte";
import RoundHeader from "./RoundHeader.svelte";

// must match --match-height in Bracket.svelte and the match gap below
const MATCH_HEIGHT = 55;
const GAP = 32;
const MATCH_SPACING = MATCH_HEIGHT + GAP;

interface Props {
	bracket: Bracket;
	tournament: Tournament;
	ownTeamId: number | undefined;
	type: "winners" | "losers" | "single";
	/** Group shown of a bracket split into groups, defaults to the first. */
	groupId?: number;
	isExpanded?: boolean;
	exitGroups?: MatchExitGroupsById;
	vods: VodsByTournamentId;
}

let {
	bracket,
	tournament,
	ownTeamId,
	type,
	groupId,
	isExpanded,
	exitGroups,
	vods,
}: Props = $props();

const rounds = $derived(
	getRounds({
		type,
		bracketData: bracket.data,
		groupId: groupId ?? bracket.data.group[0]?.id,
	}),
);
const exitDestinations = $derived(bracket.matchExitDestinations());
const firstMatchOfGroup = $derived(
	bracket.data.match.find((match) => match.roundId === rounds[0]?.id),
);
const matchesOfRound = (roundId: number | undefined) =>
	bracket.data.match.filter((match) => match.roundId === roundId);

const hiddenRoundIds = $derived(
	new Set(
		rounds
			.filter((round, roundIdx) => {
				if (isExpanded) return false;
				if (roundIdx >= rounds.length - 2) return false;

				return !matchesOfRound(round.id).some(
					(match) => match.opponent1 && match.opponent2 && !match.winnerSide,
				);
			})
			.map((round) => round.id),
	),
);

const firstVisibleRound = $derived(
	rounds.find((round) => !hiddenRoundIds.has(round.id)),
);
const compactedFirstRoundId = $derived(
	resolveCompactedFirstRoundId(firstVisibleRound?.id),
);
const baseRoundMatchCount = $derived.by(() => {
	const count = matchesOfRound(firstVisibleRound?.id).length;
	return compactedFirstRoundId !== null ? count / 2 : count;
});

const columns = $derived(
	rounds.flatMap((round, roundIdx) => {
		if (hiddenRoundIds.has(round.id)) return [];

		const allRoundMatches = matchesOfRound(round.id);
		const matches =
			round.id === compactedFirstRoundId
				? R.chunk(allRoundMatches, 2).map(
						(pair) =>
							pair.find((match) => match.opponent1 && match.opponent2) ??
							pair[0],
					)
				: allRoundMatches;

		const isLastRound = roundIdx === rounds.length - 1;
		const nextRound = rounds[roundIdx + 1];
		const nextRoundMatchCount = nextRound
			? matchesOfRound(nextRound.id).length
			: 0;

		const atLeastOneColumnHidden = rounds
			.slice(0, roundIdx)
			.some((previousRound) => hiddenRoundIds.has(previousRound.id));

		const lineType = (matchIdx: number): LineType => {
			if (isLastRound) return "none";
			if (nextRound?.name === TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH) {
				return "none";
			}
			if (nextRound && hiddenRoundIds.has(nextRound.id)) return "none";
			if (nextRoundMatchCount === matches.length) return "straight";
			return matchIdx % 2 === 0 ? "curve-down" : "curve-up";
		};

		const verticalExtend = (() => {
			if (matches.length <= 1) return undefined;
			if (nextRoundMatchCount === matches.length) return undefined;

			const spreadFactor = baseRoundMatchCount / matches.length;
			return GAP / 2 + (spreadFactor - 1) * (MATCH_SPACING / 2);
		})();

		const isGrands =
			round.name === TOURNAMENT.ROUND_NAMES.GRAND_FINALS ||
			round.name === TOURNAMENT.ROUND_NAMES.BRACKET_RESET;

		return [
			{
				round,
				matches: matches.map((match, matchIdx) => ({
					match,
					lineType: lineType(matchIdx),
				})),
				verticalExtend,
				someMatchOngoing: matches.some(
					(match) => match.opponent1 && match.opponent2 && !match.winnerSide,
				),
				hasExits: matches.some(
					(match) =>
						match.opponent1 &&
						match.opponent2 &&
						exitDestinations.has(match.id),
				),
				topBye:
					!atLeastOneColumnHidden &&
					compactedFirstRoundId === null &&
					(type === "winners" || type === "single") &&
					(!firstMatchOfGroup?.opponent1 || !firstMatchOfGroup?.opponent2),
				matchType: isGrands
					? ("grands" as const)
					: type === "winners"
						? ("winners" as const)
						: type === "losers"
							? ("losers" as const)
							: undefined,
			},
		];
	}),
);

/**
 * Compacted = one first round slot per second round match instead of two, halving the height. Possible
 * when fewer than half of the potential first round matches are played, as then each second round match
 * has at most one feeder that can sit right next to it with a straight connector.
 */
function resolveCompactedFirstRoundId(firstVisibleRoundId: number | undefined) {
	const [firstRound, secondRound] = rounds;
	if (!firstRound || !secondRound) return null;
	if (firstRound.id !== firstVisibleRoundId) return null;

	const firstRoundMatches = matchesOfRound(firstRound.id);
	if (firstRoundMatches.length !== matchesOfRound(secondRound.id).length * 2) {
		return null;
	}

	const playedMatchCount = firstRoundMatches.filter(
		(match) => match.opponent1 && match.opponent2,
	).length;
	if (playedMatchCount > firstRoundMatches.length / 2) return null;

	const everyPairHasAtMostOnePlayedMatch = R.chunk(firstRoundMatches, 2).every(
		(pair) =>
			pair.filter((match) => match.opponent1 && match.opponent2).length <= 1,
	);
	if (!everyPairHasAtMostOnePlayedMatch) return null;

	return firstRound.id;
}
</script>

<div class="elim-container" style:--round-count={columns.length}>
	{#each columns as column (column.round.id)}
		<div
			class={["elim-round-column", column.hasExits && "elim-round-column-with-exits"]}
			data-round-id={column.round.id}
			data-testid="round-column"
		>
			<RoundHeader
				name={column.round.name}
				bestOf={column.round.maps?.count}
				showInfos={column.someMatchOngoing}
				maps={column.round.maps}
			/>
			<div
				class={[
					"elim-round-matches-container",
					column.topBye && "elim-round-matches-container-top-bye",
				]}
			>
				{#each column.matches as { match, lineType } (match.id)}
					<Match
						{match}
						{tournament}
						{ownTeamId}
						{vods}
						roundNumber={column.round.number}
						isPreview={bracket.preview}
						showSimulation={column.round.name !==
							TOURNAMENT.ROUND_NAMES.BRACKET_RESET}
						{bracket}
						type={column.matchType}
						{lineType}
						lineVerticalExtend={column.verticalExtend}
						exitDestinations={exitDestinations.get(match.id)}
						exitGroups={exitGroups?.[match.id]}
					/>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	@layer features {
		.elim-container {
			--line-width: 30px;
			display: grid;
			grid-template-columns: repeat(var(--round-count), auto);
			justify-content: start;
			overflow: visible;
		}

		.elim-round-matches-container {
			display: flex;
			flex-direction: column;
			justify-content: space-around;
			gap: var(--s-8);
			margin-top: var(--s-6);
			flex: 1;
			overflow: visible;
		}

		.elim-round-matches-container-top-bye {
			margin-top: -18px;
		}

		.elim-round-column {
			/* room right of the matches for the brackets teams leave to, see `.match-exits` */
			--exit-width: 0px;
			display: flex;
			flex-direction: column;
			width: calc(var(--match-width) + var(--line-width) + var(--exit-width));
		}

		.elim-round-column-with-exits {
			--exit-width: 160px;
		}
	}
</style>
