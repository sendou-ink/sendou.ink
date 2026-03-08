import clsx from "clsx";
import { TOURNAMENT } from "../../../tournament/tournament-constants";
import type { Bracket as BracketType } from "../../core/Bracket";
import { getRounds } from "../../core/rounds";
import styles from "./bracket.module.css";
import { Match } from "./Match";
import { RoundHeader } from "./RoundHeader";

interface EliminationBracketSideProps {
	bracket: BracketType;
	type: "winners" | "losers" | "single";
	isExpanded?: boolean;
}

// these values must match --match-height and gap in bracket.module.css
const MATCH_HEIGHT = 55;
const GAP = 32;
const MATCH_SPACING = MATCH_HEIGHT + GAP;

export function EliminationBracketSide(props: EliminationBracketSideProps) {
	const rounds = getRounds({ ...props, bracketData: props.bracket.data });

	const firstRoundMatchCount = props.bracket.data.match.filter(
		(match) => match.round_id === rounds[0]?.id,
	).length;

	let atLeastOneColumnHidden = false;
	return (
		<div
			className={styles.elimContainer}
			style={{ "--round-count": rounds.length }}
		>
			{rounds.flatMap((round, roundIdx) => {
				const bestOf = round.maps?.count;

				const matches = props.bracket.data.match.filter(
					(match) => match.round_id === round.id,
				);

				const isLastRound = roundIdx === rounds.length - 1;
				const nextRound = rounds[roundIdx + 1];
				const nextRoundMatchCount = nextRound
					? props.bracket.data.match.filter(
							(match) => match.round_id === nextRound.id,
						).length
					: 0;

				const someMatchOngoing = matches.some(
					(match) =>
						match.opponent1 &&
						match.opponent2 &&
						match.opponent1.result !== "win" &&
						match.opponent2.result !== "win",
				);

				if (
					!props.isExpanded &&
					// always show at least 2 rounds per side
					roundIdx < rounds.length - 2 &&
					!someMatchOngoing
				) {
					atLeastOneColumnHidden = true;
					return null;
				}

				return (
					<div
						key={round.id}
						className={styles.elimRoundColumn}
						data-round-id={round.id}
					>
						<RoundHeader
							roundId={round.id}
							name={round.name}
							bestOf={bestOf}
							showInfos={someMatchOngoing}
							maps={round.maps}
						/>
						<div
							className={clsx(styles.elimRoundMatchesContainer, {
								[styles.elimRoundMatchesContainerTopBye]:
									!atLeastOneColumnHidden &&
									props.type === "winners" &&
									(!props.bracket.data.match[0].opponent1 ||
										!props.bracket.data.match[0].opponent2),
							})}
						>
							{matches.map((match, matchIdx) => {
								const lineType = (() => {
									if (isLastRound) return "none" as const;
									if (nextRoundMatchCount === matches.length)
										return "straight" as const;
									return matchIdx % 2 === 0
										? ("curve-down" as const)
										: ("curve-up" as const);
								})();

								const verticalExtend = (() => {
									if (matches.length <= 1) return undefined;
									if (nextRoundMatchCount === matches.length) return undefined;

									const spreadFactor = firstRoundMatchCount / matches.length;
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
										lineType={lineType}
										lineVerticalExtend={verticalExtend}
									/>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}
