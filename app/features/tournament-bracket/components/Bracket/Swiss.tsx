import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import { Button } from "~/components/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import {
	useBracketExpanded,
	useTournament,
} from "~/features/tournament/routes/to.$id";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type { Match as MatchType } from "~/modules/brackets-model";
import type { Bracket as BracketType } from "../../core/Bracket";
import { groupNumberToLetters } from "../../tournament-bracket-utils";
import { Match } from "./Match";
import { PlacementsTable } from "./PlacementsTable";
import { RoundHeader } from "./RoundHeader";

export function SwissBracket({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const user = useUser();
	const tournament = useTournament();
	const { bracketExpanded } = useBracketExpanded();

	const groups = getGroups(bracket);
	const [selectedGroupId, setSelectedGroupId] = useSearchParamState({
		defaultValue: groups[0].groupId,
		name: "group",
		revive: (id) =>
			groups.find((g) => g.groupId === Number(id))
				? Number(id)
				: groups[0].groupId,
	});
	const fetcher = useFetcher();

	const selectedGroup = groups.find((g) => g.groupId === selectedGroupId)!;

	const rounds = bracket.data.round.filter(
		(r) => r.group_id === selectedGroupId,
	);

	// when bracket starts we go from "virtual id" to a real one
	// which would cause the admin to see empty group after starting
	// bracket
	if (!groups.some((g) => g.groupId === selectedGroupId)) {
		setSelectedGroupId(groups[0].groupId);
	}

	const someMatchOngoing = (matches: MatchType[]) =>
		matches.some(
			(match) =>
				match.opponent1 &&
				match.opponent2 &&
				match.opponent1.result !== "win" &&
				match.opponent2.result !== "win",
		);

	const allRoundsFinished = () => {
		for (const round of rounds) {
			const matches = bracket.data.match.filter(
				(match) =>
					match.round_id === round.id && match.group_id === selectedGroupId,
			);

			if (matches.length === 0 || someMatchOngoing(matches)) {
				return false;
			}
		}

		return true;
	};

	const roundThatCanBeStartedId = () => {
		if (!tournament.isOrganizer(user) || bracket.preview) return undefined;

		for (const round of rounds) {
			const matches = bracket.data.match.filter(
				(match) =>
					match.round_id === round.id && match.group_id === selectedGroupId,
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
				{groups.length > 1 && (
					<div className="stack horizontal">
						{groups.map((g) => (
							<Button
								key={g.groupId}
								onClick={() => setSelectedGroupId(g.groupId)}
								className={clsx(
									"tournament-bracket__bracket-nav__link tournament-bracket__bracket-nav__link__big",
									{
										"tournament-bracket__bracket-nav__link__selected":
											selectedGroupId === g.groupId,
									},
								)}
								testId={`group-${g.groupName.split(" ")[1]}-button`}
							>
								{g.groupName.split(" ")[1]}
							</Button>
						))}
					</div>
				)}
				<div className="stack lg">
					{rounds.map((round, roundI) => {
						const matches = bracket.data.match.filter(
							(match) =>
								match.round_id === round.id &&
								match.group_id === selectedGroupId,
						);

						if (
							matches.length > 0 &&
							!bracketExpanded &&
							!someMatchOngoing(matches) &&
							roundI !== rounds.length - 1
						) {
							return null;
						}

						const bestOf = round.maps?.count;

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
										name={`Round ${round.number}`}
										bestOf={bestOf}
										showInfos={someMatchOngoing(matches)}
										maps={round.maps}
									/>
									{roundThatCanBeStartedId() === round.id ? (
										<fetcher.Form method="post">
											<input
												type="hidden"
												name="groupId"
												value={selectedGroupId}
											/>
											<input
												type="hidden"
												name="bracketIdx"
												value={bracketIdx}
											/>
											<SubmitButton
												_action="ADVANCE_BRACKET"
												state={fetcher.state}
												testId="start-round-button"
											>
												Start round
											</SubmitButton>
										</fetcher.Form>
									) : null}
									{someMatchOngoing(matches) &&
									tournament.isOrganizer(user) &&
									roundI > 0 ? (
										<FormWithConfirm
											dialogHeading={`Delete all matches of round ${round.number}?`}
											fields={[
												["groupId", selectedGroupId],
												["roundId", round.id],
												["bracketIdx", bracketIdx],
												["_action", "UNADVANCE_BRACKET"],
											]}
										>
											<Button
												variant="minimal-destructive"
												type="submit"
												className="build__small-text mb-4"
												size="tiny"
												testId="reset-round-button"
											>
												Reset round
											</Button>
										</FormWithConfirm>
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
												group={selectedGroup.groupName.split(" ")[1]}
											/>
										);
									})}
								</div>
								{teamWithBye ? (
									<div className="text-xs text-lighter font-semi-bold">
										BYE: {teamWithBye.name}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
				<PlacementsTable
					bracket={bracket}
					groupId={selectedGroupId}
					allMatchesFinished={allRoundsFinished()}
				/>
			</div>
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
