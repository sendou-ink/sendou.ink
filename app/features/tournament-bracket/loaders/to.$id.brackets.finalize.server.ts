import { type LoaderFunctionArgs, redirect } from "react-router";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as Standings from "~/features/tournament/core/Standings";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { setParticipationByUserId } from "~/features/tournament-bracket/core/summarizer.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { invariant } from "~/utils/invariant";
import type { SerializeFrom } from "~/utils/remix";

export type FinalizeTournamentLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "action",
	});

	if (!tournament.canFinalize(user)) {
		return redirect(
			tournamentBracketsPage({ tournamentId: tournament.ctx.id }),
		);
	}

	const event = await CalendarRepository.findById(tournament.ctx.eventId, {
		includeBadgePrizes: true,
		includeTrophy: true,
	});

	invariant(
		event?.badgePrizes,
		`Tournament ${tournament.ctx.id} event not found for badges`,
	);

	const badges = event.badgePrizes.sort((a, b) => a.id - b.id);
	const standingsResult = Standings.tournamentStandings(tournament);

	return {
		badges,
		trophy: event.trophy,
		standings: await standingsWithSetParticipation({
			tournament,
			standingsResult,
		}),
		winnerTournamentTeamIds: Standings.winners(standingsResult).map(
			(standing) => standing.team.id,
		),
	};
};

async function standingsWithSetParticipation({
	tournament,
	standingsResult,
}: {
	tournament: Tournament;
	standingsResult: Standings.TournamentStandingsResult;
}) {
	const finalStandings = Standings.flattenStandings(standingsResult);

	const results = await TournamentMatchRepository.findAllResultsByTournamentId(
		tournament.ctx.id,
	);
	invariant(results.length > 0, "No results found");

	const setResults = setParticipationByUserId({
		results,
		teams: tournament.ctx.teams,
	});

	const rostersByTeamId = new Map(
		(
			await TournamentRepository.findTeamsFullByTournamentId(tournament.ctx.id)
		).map((team) => [team.id, team.members]),
	);

	return finalStandings.map((standing) => ({
		placement: standing.placement,
		tournamentTeamId: standing.team.id,
		name: standing.team.name,
		members: (rostersByTeamId.get(standing.team.id) ?? [])
			.filter((member) => standing.team.memberUserIds.includes(member.userId))
			.map((member) => ({
				...member,
				setResults: setResults.get(member.userId) ?? [],
			})),
	}));
}
