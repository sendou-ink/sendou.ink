import { TOURNAMENT } from "../../../tournament/tournament-constants";
import type { Bracket as BracketType } from "../../core/Bracket";
import type { MatchExitGroupsById } from "../../core/Bracket/Bracket";
import * as EliminationLayout from "../../core/EliminationLayout";
import { getRounds } from "../../core/rounds";
import {
	BracketColumn,
	BracketColumnMatches,
	BracketColumns,
} from "./BracketColumns";
import { Match } from "./Match";
import { RoundHeader } from "./RoundHeader";
import { useBracketSpoilerCensor } from "./useBracketSpoilerCensor";

interface EliminationBracketSideProps {
	bracket: BracketType;
	type: "winners" | "losers" | "single";
	/** Group shown of a bracket split into groups, defaults to the first. */
	groupId?: number;
	isExpanded?: boolean;
	exitGroups?: MatchExitGroupsById;
}

// must match --match-height in index.module.css and the match gap in BracketColumns.module.css
const MATCH_HEIGHT = 55;
const GAP = 32;
const MATCH_SPACING = MATCH_HEIGHT + GAP;

export function EliminationBracketSide(props: EliminationBracketSideProps) {
	const { censored, matchCensorLevel } = useBracketSpoilerCensor();
	const rounds = getRounds({
		type: props.type,
		bracketData: props.bracket.data,
		groupId: props.groupId ?? props.bracket.data.group[0]?.id,
	});
	const exitDestinations = props.bracket.matchExitDestinations();
	const firstMatchOfGroup = props.bracket.data.match.find(
		(match) => match.roundId === rounds[0]?.id,
	);

	const layout = EliminationLayout.resolve({
		rounds,
		bracketData: props.bracket.data,
		isCompactified: !props.isExpanded,
	});
	const hiddenRoundIds = new Set([
		...layout.hiddenRoundIds,
		...rounds
			.filter(
				(round) =>
					censored && round.name === TOURNAMENT.ROUND_NAMES.BRACKET_RESET,
			)
			.map((round) => round.id),
	]);
	const { compactedFirstRoundId } = layout;

	const firstVisibleRound = rounds.find(
		(round) => !hiddenRoundIds.has(round.id),
	);
	const firstVisibleRoundMatchCount = props.bracket.data.match.filter(
		(match) => match.roundId === firstVisibleRound?.id,
	).length;

	const baseRoundMatchCount =
		compactedFirstRoundId !== null
			? firstVisibleRoundMatchCount / 2
			: firstVisibleRoundMatchCount;

	return (
		<BracketColumns roundCount={rounds.length - hiddenRoundIds.size}>
			{rounds.flatMap((round, roundIdx) => {
				const bestOf = round.maps?.count;

				const matches = EliminationLayout.matchesOfRound({
					roundId: round.id,
					bracketData: props.bracket.data,
					compactedFirstRoundId,
				});

				const isLastRound = roundIdx === rounds.length - 1;
				const nextRound = rounds[roundIdx + 1];
				const nextRoundMatchCount = nextRound
					? props.bracket.data.match.filter(
							(match) => match.roundId === nextRound.id,
						).length
					: 0;

				const someMatchOngoing = matches.some(
					(match) => match.opponent1 && match.opponent2 && !match.winnerSide,
				);

				if (hiddenRoundIds.has(round.id)) return null;

				const atLeastOneColumnHidden = rounds
					.slice(0, roundIdx)
					.some((previousRound) => hiddenRoundIds.has(previousRound.id));

				const hasExits = matches.some(
					(match) =>
						match.opponent1 &&
						match.opponent2 &&
						exitDestinations.has(match.id),
				);

				return (
					<BracketColumn key={round.id} roundId={round.id} hasExits={hasExits}>
						<RoundHeader
							roundId={round.id}
							bracketIdx={props.bracket.idx}
							name={round.name}
							bestOf={bestOf}
							showInfos={someMatchOngoing}
							maps={round.maps}
						/>
						<BracketColumnMatches
							topBye={
								!atLeastOneColumnHidden &&
								compactedFirstRoundId === null &&
								(props.type === "winners" || props.type === "single") &&
								(!firstMatchOfGroup?.opponent1 || !firstMatchOfGroup?.opponent2)
							}
						>
							{matches.map((match, matchIdx) => {
								const lineType = (() => {
									if (isLastRound) return "none" as const;
									if (
										nextRound?.name === TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH
									)
										return "none" as const;
									if (nextRound && hiddenRoundIds.has(nextRound.id))
										return "none" as const;
									if (nextRoundMatchCount === matches.length)
										return "straight" as const;
									return matchIdx % 2 === 0
										? ("curve-down" as const)
										: ("curve-up" as const);
								})();

								const verticalExtend = (() => {
									if (matches.length <= 1) return undefined;
									if (nextRoundMatchCount === matches.length) return undefined;

									const spreadFactor = baseRoundMatchCount / matches.length;
									return GAP / 2 + (spreadFactor - 1) * (MATCH_SPACING / 2);
								})();

								return (
									<Match
										key={match.id}
										match={match}
										roundNumber={round.number}
										isPreview={props.bracket.preview}
										showSimulation={
											round.name !== TOURNAMENT.ROUND_NAMES.BRACKET_RESET
										}
										bracket={props.bracket}
										type={
											round.name === TOURNAMENT.ROUND_NAMES.GRAND_FINALS ||
											round.name === TOURNAMENT.ROUND_NAMES.BRACKET_RESET
												? "grands"
												: props.type === "winners"
													? "winners"
													: props.type === "losers"
														? "losers"
														: undefined
										}
										spoilerCensor={matchCensorLevel({
											bracketType:
												props.type === "single"
													? "single_elimination"
													: "double_elimination",
											roundName: round.name,
											roundNumber: round.number,
											roundIdx,
											matchType:
												round.name === TOURNAMENT.ROUND_NAMES.GRAND_FINALS ||
												round.name === TOURNAMENT.ROUND_NAMES.BRACKET_RESET
													? "grands"
													: props.type === "losers"
														? "losers"
														: "winners",
										})}
										lineType={lineType}
										lineVerticalExtend={verticalExtend}
										exitDestinations={exitDestinations.get(match.id)}
										exitGroups={props.exitGroups?.[match.id]}
									/>
								);
							})}
						</BracketColumnMatches>
					</BracketColumn>
				);
			})}
		</BracketColumns>
	);
}
