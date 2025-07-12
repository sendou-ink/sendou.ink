import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryCurrentUserSeedingRating,
	queryTeamPlayerRatingAverage,
} from "~/features/mmr/mmr-utils.server";
import * as Standings from "~/features/tournament/core/Standings";
import { tournamentSummary } from "~/features/tournament-bracket/core/summarizer.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { allMatchResultsByTournamentId } from "~/features/tournament-bracket/queries/allMatchResultsByTournamentId.server";
import invariant from "~/utils/invariant";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentFromDB({ tournamentId, user });

	const badges = (
		await CalendarRepository.findById(tournament.ctx.eventId, {
			includeBadgePrizes: true,
		})
	)?.badgePrizes;

	return {
		badges,
		standings: await standingsWithSetParticipation(tournament),
	};
};

async function standingsWithSetParticipation(tournament: Tournament) {
	const finalStandings = Standings.tournamentStandings(tournament);

	const results = allMatchResultsByTournamentId(tournament.ctx.id);
	invariant(results.length > 0, "No results found");

	const season = Seasons.current(tournament.ctx.startTime)?.nth;

	const seedingSkillCountsFor = tournament.skillCountsFor;

	const { setResults } = tournamentSummary({
		teams: tournament.ctx.teams,
		finalStandings,
		results,
		calculateSeasonalStats: tournament.ranked,
		queryCurrentTeamRating: (identifier) =>
			queryCurrentTeamRating({ identifier, season: season! }).rating,
		queryCurrentUserRating: (userId) =>
			queryCurrentUserRating({ userId, season: season! }),
		queryTeamPlayerRatingAverage: (identifier) =>
			queryTeamPlayerRatingAverage({
				identifier,
				season: season!,
			}),
		queryCurrentSeedingRating: (userId) =>
			queryCurrentUserSeedingRating({
				userId,
				type: seedingSkillCountsFor!,
			}),
		seedingSkillCountsFor,
	});

	return finalStandings.map((standing) => {
		standing.team.members;
		return {
			name: standing.team.name,
			members: standing.team.members.map((member) => ({
				...member,
				setResults: setResults.get(member.userId) ?? [],
			})),
		};
	});
}
