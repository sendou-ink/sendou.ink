import { ActionButton } from "~/components/ActionButton";
import { useUser } from "~/features/auth/core/user";
import { useBracketExpanded } from "~/features/tournament/routes/to.$id";
import { useTournament } from "~/features/tournament/tournament-context";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { MatchData as MatchType } from "~/features/tournament-bracket/core/engine/types";
import type { Bracket as BracketType } from "../../core/Bracket";
import { bracketSchema } from "../../tournament-bracket-schemas";
import { bracketGroups, GroupTabs } from "./GroupTabs";
import { Match } from "./Match";
import { PlacementsTable } from "./PlacementsTable";
import { RoundHeader } from "./RoundHeader";
import { useBracketSpoilerCensor } from "./useBracketSpoilerCensor";

export function SwissBracket({
	bracket,
	bracketIdx,
	groupId,
}: {
	bracket: BracketType;
	bracketIdx: number;
	/** Group whose matches were loaded, null when every group's were. */
	groupId?: number | null;
}) {
	const user = useUser();
	const tournament = useTournament();
	const { bracketExpanded } = useBracketExpanded();
	const { censored, matchCensorLevel } = useBracketSpoilerCensor();

	const groups = bracketGroups(bracket);
	// group of the shipped matches rather than the search param's, so a switch shows once its matches loaded
	const selectedGroupId = groupId ?? groups[0].groupId;

	const selectedGroup = groups.find((g) => g.groupId === selectedGroupId)!;

	const rounds = bracket.data.round.filter(
		(r) => r.groupId === selectedGroupId,
	);

	const someMatchOngoing = (matches: MatchType[]) =>
		matches.some(
			(match) => match.opponent1 && match.opponent2 && !match.winnerSide,
		);

	const allRoundsFinished = () => {
		for (const round of rounds) {
			const matches = bracket.data.match.filter(
				(match) =>
					match.roundId === round.id && match.groupId === selectedGroupId,
			);

			if (matches.length === 0 || someMatchOngoing(matches)) {
				return false;
			}
		}

		return true;
	};

	// early advance: the group can run out of teams before every round is played
	const groupHasActiveTeams = Engine.groupHasActiveTeams(bracket.data, {
		groupId: selectedGroupId,
		standings: bracket.liveStandings,
		settings: bracket.settings,
	});

	const roundThatCanBeStartedId = () => {
		if (!tournament.isOrganizer(user) || bracket.preview) return undefined;
		if (!groupHasActiveTeams) return undefined;

		for (const round of rounds) {
			const matches = bracket.data.match.filter(
				(match) =>
					match.roundId === round.id && match.groupId === selectedGroupId,
			);

			if (someMatchOngoing(matches) && matches.length > 0) {
				return undefined;
			}

			if (matches.length === 0) {
				return round.id;
			}
		}

		return;
	};

	return (
		<div className="stack xl">
			<div className="stack lg">
				<GroupTabs bracket={bracket} selectedGroupId={selectedGroupId} />
				<div className="stack lg">
					{rounds.map((round, roundI) => {
						const matches = bracket.data.match.filter(
							(match) =>
								match.roundId === round.id && match.groupId === selectedGroupId,
						);

						if (matches.length === 0 && !groupHasActiveTeams) {
							return null;
						}

						if (
							matches.length > 0 &&
							!bracketExpanded &&
							!someMatchOngoing(matches) &&
							roundI !== rounds.length - 1
						) {
							return null;
						}

						const bestOf = round.maps?.count;

						const ongoingMatches = matches.filter(
							(m) => m.opponent1 && m.opponent2 && !m.winnerSide,
						);
						const startedAtValues = ongoingMatches
							.map((m) => m.startedAt)
							.filter((t): t is number => typeof t === "number");
						const roundStartedAt =
							startedAtValues.length > 0 ? Math.min(...startedAtValues) : null;

						const teamWithByeId = matches.find((m) => !m.opponent2)?.opponent1
							?.id;
						const teamWithBye = teamWithByeId
							? tournament.teamById(teamWithByeId)
							: null;

						return (
							<div
								key={round.id}
								className={matches.length > 0 ? "stack md-plus" : "stack"}
							>
								<div className="stack sm horizontal">
									<RoundHeader
										roundId={round.id}
										bracketIdx={bracket.idx}
										name={`Round ${round.number}`}
										bestOf={bestOf}
										showInfos={someMatchOngoing(matches)}
										maps={round.maps}
										roundStartedAt={roundStartedAt}
										matches={ongoingMatches}
									/>
									{roundThatCanBeStartedId() === round.id ? (
										<ActionButton
											schema={bracketSchema}
											action="ADVANCE_BRACKET"
											fields={{ groupId: selectedGroupId, bracketIdx }}
											testId="start-round-button"
										>
											Start round
										</ActionButton>
									) : null}
									{someMatchOngoing(matches) &&
									tournament.isOrganizer(user) &&
									roundI > 0 ? (
										<ActionButton
											schema={bracketSchema}
											action="UNADVANCE_BRACKET"
											fields={{
												groupId: selectedGroupId,
												roundId: round.id,
												bracketIdx,
											}}
											confirm={{
												dialogHeading: `Delete all matches of round ${round.number}?`,
											}}
											variant="minimal-destructive"
											className="small-text mb-4"
											size="small"
											testId="reset-round-button"
										>
											Reset round
										</ActionButton>
									) : null}
								</div>
								<div className="stack horizontal md lg-row flex-wrap">
									{matches.length === 0 ? (
										<div className="text-lighter text-md font-bold">
											Waiting for the previous round to finish
										</div>
									) : null}
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
												group={selectedGroup.letters}
												hideMatchTimer
												spoilerCensor={matchCensorLevel({
													bracketType: "swiss",
													roundNumber: round.number,
													roundIdx: roundI,
													matchType: "groups",
												})}
											/>
										);
									})}
								</div>
								{teamWithBye && !(censored && round.number > 1) ? (
									<div
										className="text-xs text-lighter font-semi-bold"
										data-testid="bye-team"
									>
										BYE: {teamWithBye.name}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
				{censored ? null : (
					<PlacementsTable
						bracket={bracket}
						groupId={selectedGroupId}
						allMatchesFinished={allRoundsFinished()}
					/>
				)}
			</div>
		</div>
	);
}
