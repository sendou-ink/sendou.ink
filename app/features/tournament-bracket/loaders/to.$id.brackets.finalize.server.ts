import { type LoaderFunctionArgs, redirect } from "react-router";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { seasonRatings, seedingRatings } from "~/features/mmr/mmr-utils.server";
import * as Standings from "~/features/tournament/core/Standings";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	summaryRatingTargets,
	tournamentSummary,
} from "~/features/tournament-bracket/core/summarizer.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
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

	return {
		badges,
		trophy: event.trophy,
		standings: await standingsWithSetParticipation(tournament),
	};
};

async function standingsWithSetParticipation(tournament: Tournament) {
	const standingsResult = Standings.tournamentStandings(tournament);
	const finalStandings = Standings.flattenStandings(standingsResult);

	const results = await TournamentMatchRepository.findAllResultsByTournamentId(
		tournament.ctx.id,
	);
	invariant(results.length > 0, "No results found");

	const season = Seasons.current(tournament.ctx.startsAt)?.nth;

	const seedingSkillCountsFor = tournament.skillCountsFor;

	const calculateSeasonalStats =
		tournament.ranked && typeof season === "number";
	const ratingTargets = summaryRatingTargets(results);
	const ratings = calculateSeasonalStats
		? await seasonRatings({ season, ...ratingTargets })
		: null;
	const seedingRating = seedingSkillCountsFor
		? await seedingRatings({
				type: seedingSkillCountsFor,
				userIds: ratingTargets.userIds,
			})
		: null;

	const { setResults } = tournamentSummary({
		teams: tournament.ctx.teams,
		finalStandings,
		results,
		calculateSeasonalStats,
		queryCurrentTeamRating: (identifier) => ratings!.team(identifier).rating,
		queryCurrentUserRating: (userId) => ratings!.user(userId),
		queryTeamPlayerRatingAverage: (identifier) =>
			ratings!.teamPlayerAverage(identifier),
		queryCurrentSeedingRating: (userId) => seedingRating!(userId),
		seedingSkillCountsFor,
		progression: tournament.ctx.settings.bracketProgression,
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
