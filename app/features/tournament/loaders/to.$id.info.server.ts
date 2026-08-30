import type { LoaderFunctionArgs } from "react-router";
import { estimatedEndsAt } from "~/features/availability/core/TournamentDuration.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{
			for: "view",
		},
	);

	const [description, endsAt] = await Promise.all([
		TournamentRepository.findDescriptionById(tournamentId),
		estimatedEnd(tournament)?.catch((error) => {
			logger.error("Failed to estimate the tournament's end", error);
			return null;
		}) ?? null,
	]);

	if (!user) {
		return { isSaved: false, description, endsAt };
	}

	return {
		isSaved: await SavedCalendarEventRepository.isSaved({
			userId: user.id,
			tournamentId,
		}),
		description,
		endsAt,
	};
};

function estimatedEnd(tournament: Tournament) {
	if (tournament.isLeague) return null;
	if (tournament.ctx.startsAt <= new Date()) return null;
	const isMultiSession = tournament.ctx.settings.bracketProgression.some(
		(bracket) => bracket.startTime,
	);
	if (isMultiSession) return null;

	return estimatedEndsAt({
		name: tournament.ctx.name,
		organizationId: tournament.ctx.organization?.id ?? null,
		startsAt: dateToDatabaseTimestamp(tournament.ctx.startsAt),
		minMembersPerTeam: tournament.minMembersPerTeam,
		bracketTypes: tournament.ctx.settings.bracketProgression.map(
			(bracket) => bracket.type,
		),
		teamCount: tournament.ctx.teams.length,
	});
}
