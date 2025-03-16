import type { Match as MatchType } from "~/modules/brackets-model";
import type { Bracket as BracketType } from "../../core/Bracket";
import { groupNumberToLetters } from "../../tournament-bracket-utils";
import { Match } from "./Match";
import { PlacementsTable } from "./PlacementsTable";
import { RoundHeader } from "./RoundHeader";

export function RoundRobinBracket({ bracket }: { bracket: BracketType }) {
	const groups = getGroups(bracket);

	return (
		<div className="stack xl">
			{groups.map(({ groupName, groupId }) => {
				const rounds = bracket.data.round.filter((r) => r.group_id === groupId);

				const allMatchesFinished = rounds.every((round) => {
					const matches = bracket.data.match.filter(
						(match) => match.round_id === round.id,
					);

					return matches.every(
						(match) =>
							!match.opponent1 ||
							!match.opponent2 ||
							match.opponent1?.result === "win" ||
							match.opponent2?.result === "win",
					);
				});

				return (
					<div key={groupName} className="stack lg">
						<h2 className="text-lg">{groupName}</h2>
						<div
							className="elim-bracket__container"
							style={{ "--round-count": rounds.length }}
						>
							{rounds.flatMap((round) => {
								const bestOf = round.maps?.count;

								const matches = bracket.data.match.filter(
									(match) => match.round_id === round.id,
								);

								const someMatchOngoing = matches.some(
									(match) =>
										match.opponent1 &&
										match.opponent2 &&
										match.opponent1.result !== "win" &&
										match.opponent2.result !== "win",
								);

								return (
									<div key={round.id} className="elim-bracket__round-column">
										<RoundHeader
											roundId={round.id}
											name={`Round ${round.number}`}
											bestOf={bestOf}
											showInfos={someMatchOngoing}
											maps={round.maps}
										/>
										<div className="elim-bracket__round-matches-container">
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
														group={groupName.split(" ")[1]}
													/>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
						<PlacementsTable
							bracket={bracket}
							groupId={groupId}
							allMatchesFinished={allMatchesFinished}
						/>
					</div>
				);
			})}
		</div>
	);
}

function getGroups(bracket: BracketType) {
	const result: Array<{
		groupName: string;
		matches: MatchType[];
		groupId: number;
	}> = [];

	for (const group of bracket.data.group) {
		const matches = bracket.data.match.filter(
			(match) => match.group_id === group.id,
		);

		result.push({
			groupName: `Group ${groupNumberToLetters(group.number)}`,
			matches,
			groupId: group.id,
		});
	}

	return result;
}
