import type { Bracket as BracketType } from "../../core/Bracket";
import {
	BracketColumn,
	BracketColumnMatches,
	BracketColumns,
} from "./BracketColumns";
import { bracketGroups } from "./GroupTabs";
import { Match } from "./Match";
import { PlacementsTable } from "./PlacementsTable";
import { RoundHeader } from "./RoundHeader";
import { useBracketSpoilerCensor } from "./useBracketSpoilerCensor";

export function RoundRobinBracket({ bracket }: { bracket: BracketType }) {
	const { censored, matchCensorLevel } = useBracketSpoilerCensor();
	const groups = bracketGroups(bracket);

	return (
		<div className="stack xl">
			{groups.map(({ letters, groupId }) => {
				const rounds = bracket.data.round.filter((r) => r.groupId === groupId);

				const allMatchesFinished = rounds.every((round) => {
					const matches = bracket.data.match.filter(
						(match) => match.roundId === round.id,
					);

					return matches.every(
						(match) => !match.opponent1 || !match.opponent2 || match.winnerSide,
					);
				});

				return (
					<div key={groupId} className="stack lg ml-6">
						<h2 className="text-lg">{`Group ${letters}`}</h2>
						<BracketColumns roundCount={rounds.length}>
							{rounds.flatMap((round) => {
								const bestOf = round.maps?.count;

								const matches = bracket.data.match.filter(
									(match) => match.roundId === round.id,
								);

								const someMatchOngoing = matches.some(
									(match) =>
										match.opponent1 && match.opponent2 && !match.winnerSide,
								);

								return (
									<BracketColumn key={round.id}>
										<RoundHeader
											roundId={round.id}
											bracketIdx={bracket.idx}
											name={`Round ${round.number}`}
											bestOf={bestOf}
											showInfos={someMatchOngoing}
											maps={round.maps}
										/>
										<BracketColumnMatches>
											{matches.map((match) => {
												if (!match.opponent1 || !match.opponent2) {
													return null;
												}

												return (
													<Match
														key={match.id}
														match={match}
														roundNumber={round.number}
														isPreview={bracket.preview}
														showSimulation={false}
														bracket={bracket}
														type="groups"
														group={letters}
														spoilerCensor={matchCensorLevel({
															bracketType: "round_robin",
															roundNumber: round.number,
															roundIdx: 0,
															matchType: "groups",
														})}
													/>
												);
											})}
										</BracketColumnMatches>
									</BracketColumn>
								);
							})}
						</BracketColumns>
						{censored ? null : (
							<PlacementsTable
								bracket={bracket}
								groupId={groupId}
								allMatchesFinished={allMatchesFinished}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
