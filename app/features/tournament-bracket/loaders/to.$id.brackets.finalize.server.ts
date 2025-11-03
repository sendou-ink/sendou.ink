import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
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
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { tournamentBracketsPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export type FinalizeTournamentLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentFromDB({ tournamentId, user });

	if (!tournament.canFinalize(user)) {
		return redirect(
			tournamentBracketsPage({ tournamentId: tournament.ctx.id }),
		);
	}

	const badges = (
		await CalendarRepository.findById(tournament.ctx.eventId, {
			includeBadgePrizes: true,
		})
	)?.badgePrizes?.sort((a, b) => a.id - b.id);

	invariant(
		badges,
		`Tournament ${tournament.ctx.id} event not found for badges`,
	);

	return {
		badges,
		standings: await standingsWithSetParticipation(tournament),
	};
};

async function standingsWithSetParticipation(tournament: Tournament) {
	const standingsResult = Standings.tournamentStandings(tournament);
	const finalStandings = Standings.flattenStandings(standingsResult);

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
		progression: tournament.ctx.settings.bracketProgression,
	});

	return finalStandings.map((standing) => {
		standing.team.members;
		return {
			placement: standing.placement,
			tournamentTeamId: standing.team.id,
			name: standing.team.name,
			members: standing.team.members.map((member) => ({
				...member,
				setResults: setResults.get(member.userId) ?? [],
			})),
		};
	});
}
