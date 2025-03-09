import clsx from "clsx";
import { TOURNAMENT } from "../../../tournament/tournament-constants";
import type { Bracket as BracketType } from "../../core/Bracket";
import { getRounds } from "../../core/rounds";
import { Match } from "./Match";
import { RoundHeader } from "./RoundHeader";

interface EliminationBracketSideProps {
	bracket: BracketType;
	type: "winners" | "losers" | "single";
	isExpanded?: boolean;
}

export function EliminationBracketSide(props: EliminationBracketSideProps) {
	const rounds = getRounds({ ...props, bracketData: props.bracket.data });

	let atLeastOneColumnHidden = false;
	return (
		<div
			className="elim-bracket__container"
			style={{ "--round-count": rounds.length }}
		>
			{rounds.flatMap((round, roundIdx) => {
				const bestOf = round.maps?.count;

				const matches = props.bracket.data.match.filter(
					(match) => match.round_id === round.id,
				);

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
						className="elim-bracket__round-column"
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
							className={clsx("elim-bracket__round-matches-container", {
								"elim-bracket__round-matches-container__top-bye":
									!atLeastOneColumnHidden &&
									props.type === "winners" &&
									(!props.bracket.data.match[0].opponent1 ||
										!props.bracket.data.match[0].opponent2),
							})}
						>
							{matches.map((match) => (
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
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
