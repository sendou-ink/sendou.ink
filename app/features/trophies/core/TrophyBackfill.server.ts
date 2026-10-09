import * as R from "remeda";
import { getBracketProgressionLabel } from "~/features/tournament/tournament-utils";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as TrophyRepository from "../TrophyRepository.server";

export async function backfillableTournaments({
	organizationId,
	seriesId,
}: {
	organizationId: number;
	seriesId: number;
}) {
	const series = (
		await TournamentOrganizationRepository.findAllSeriesByOrganizationIds([
			organizationId,
		])
	).find((candidate) => candidate.id === seriesId);
	if (!series) return null;

	const tournaments = await TrophyRepository.findAllBackfillableTournaments({
		organizationId,
		substringMatches: series.substringMatches,
	});

	return tournaments.flatMap(({ settings, firstPlacers, ...tournament }) => {
		const winners = eligibleWinners({
			firstPlacers,
			bracketProgression: settings.bracketProgression,
		});
		if (winners.length === 0) return [];

		return [
			{
				...tournament,
				tournamentTeamId: winners[0].tournamentTeamId,
				teamName: R.unique(winners.map((winner) => winner.teamName)).join(
					" / ",
				),
				winners: winners.map(
					({
						div: _div,
						tournamentTeamId: _teamId,
						teamName: _name,
						...winner
					}) => winner,
				),
			},
		];
	});
}

export function eligibleWinners<
	T extends { div: string | null; setResults: ReadonlyArray<unknown> },
>({
	firstPlacers,
	bracketProgression,
}: {
	firstPlacers: T[];
	bracketProgression: Progression.ParsedBracket[];
}) {
	const hasDivisions = firstPlacers.some((placer) => placer.div !== null);
	const topDivision = hasDivisions
		? topDivisionLabel(bracketProgression)
		: null;

	return firstPlacers.filter(
		(placer) => placer.div === topDivision && placer.setResults.some(Boolean),
	);
}

function topDivisionLabel(bracketProgression: Progression.ParsedBracket[]) {
	if (Progression.hasAbDivisionsFinals(bracketProgression)) return "A";

	return getBracketProgressionLabel(
		Progression.startingBrackets(bracketProgression)[0],
		bracketProgression,
	);
}
