import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryCurrentUserSeedingRating,
	queryTeamPlayerRatingAverage,
} from "~/features/mmr/mmr-utils.server";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import * as Standings from "~/features/tournament/core/Standings";
import { tournamentSummary } from "~/features/tournament-bracket/core/summarizer.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	addSummary,
	finalizeTournament,
} from "~/features/tournament-bracket/queries/addSummary.server";
import { allMatchResultsByTournamentId } from "~/features/tournament-bracket/queries/allMatchResultsByTournamentId.server";
import {
	finalizeTournamentActionSchema,
	type NewTournamentBadgeOwners,
} from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = await requireUserId(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({
		request,
		schema: finalizeTournamentActionSchema,
	});

	errorToastIfFalsy(tournament.canFinalize(user), "Can't finalize tournament");

	const badgeOwnersValid = data.badges
		? await validateBadgeOwners(data.badges, tournament)
		: true;
	if (!badgeOwnersValid) errorToast("New badge owners invalid");

	const results = allMatchResultsByTournamentId(tournamentId);
	invariant(results.length > 0, "No results found");

	const season = Seasons.current(tournament.ctx.startTime)?.nth;

	const seedingSkillCountsFor = tournament.skillCountsFor;
	const summary = tournamentSummary({
		teams: tournament.ctx.teams,
		finalStandings: Standings.tournamentStandings(tournament),
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

	const tournamentSummaryString = `Tournament id: ${tournamentId}, mapResultDeltas.lenght: ${summary.mapResultDeltas.length}, playerResultDeltas.length ${summary.playerResultDeltas.length}, tournamentResults.length ${summary.tournamentResults.length}, skills.length ${summary.skills.length}, seedingSkills.length ${summary.seedingSkills.length}`;
	if (!tournament.isTest) {
		logger.info(`Inserting tournament summary. ${tournamentSummaryString}`);
		addSummary({
			tournamentId,
			summary,
			season,
			badgeOwners: data.badges ?? undefined,
		});
	} else {
		logger.info(
			`Did not insert tournament summary. ${tournamentSummaryString}`,
		);
		finalizeTournament(tournamentId);
	}

	if (tournament.ranked) {
		try {
			refreshUserSkills(season!);
		} catch (error) {
			logger.warn("Error refreshing user skills", error);
		}
	}

	// xxx: notify users about badges
	// if (data.badges) {
	// 	notify({...});
	// }

	clearTournamentDataCache(tournamentId);

	// xxx: success toast?
	return null;
};

/**
 * Validates that all badge owners are members of teams in the given tournament
 * and that all badge IDs are valid for the tournament's event.
 */
async function validateBadgeOwners(
	badgeOwners: NewTournamentBadgeOwners,
	tournament: Tournament,
) {
	const userIds = badgeOwners.flatMap((bo) => bo.ownerIds);

	for (const userId of userIds) {
		// this is not validating that all user ids per badge are from the same team but that is ok
		const isMemberOfSomeTeam = tournament.ctx.teams.some((team) =>
			team.members.some((member) => member.userId === userId),
		);

		if (!isMemberOfSomeTeam) {
			logger.error(
				`validateBadgeOwners: Invalid badge owner userId: ${userId}`,
			);
			return false;
		}
	}

	const eventBadgePrizes = (
		await CalendarRepository.findById(tournament.ctx.eventId, {
			includeBadgePrizes: true,
		})
	)?.badgePrizes;
	invariant(
		eventBadgePrizes,
		"validateBadgeOwners: Event with badge prizes not found",
	);

	const badgeIds = badgeOwners.map((bo) => bo.badgeId);

	for (const badgeId of badgeIds) {
		const isValidBadge = eventBadgePrizes.some(
			(badgePrize) => badgePrize.id === badgeId,
		);

		if (!isValidBadge) {
			logger.error(`validateBadgeOwners: Invalid badgeId: ${badgeId}`);
			return false;
		}
	}

	return true;
}
