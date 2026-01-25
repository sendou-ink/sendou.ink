import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryCurrentUserSeedingRating,
	queryTeamPlayerRatingAverage,
} from "~/features/mmr/mmr-utils.server";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { notify } from "~/features/notifications/core/notify.server";
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
	type TournamentBadgeReceivers,
} from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { validateBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-utils";
import { refreshTentativeTiersCache } from "~/features/tournament-organization/core/tentativeTiers.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
	successToastWithRedirect,
} from "~/utils/remix.server";
import { tournamentBracketsPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
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

	const badgeOwnersValid = data.badgeReceivers
		? await requireValidBadgeReceivers(data.badgeReceivers, tournament)
		: true;
	if (!badgeOwnersValid) errorToast("New badge owners invalid");

	const results = allMatchResultsByTournamentId(tournamentId);
	invariant(results.length > 0, "No results found");

	const season = Seasons.current(tournament.ctx.startTime)?.nth;

	const seedingSkillCountsFor = tournament.skillCountsFor;
	const standingsResult = Standings.tournamentStandings(tournament);
	const finalStandings = Standings.flattenStandings(standingsResult);
	const summary = tournamentSummary({
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

	const tournamentSummaryString = `Tournament id: ${tournamentId}, mapResultDeltas.lenght: ${summary.mapResultDeltas.length}, playerResultDeltas.length ${summary.playerResultDeltas.length}, tournamentResults.length ${summary.tournamentResults.length}, skills.length ${summary.skills.length}, seedingSkills.length ${summary.seedingSkills.length}`;
	if (!tournament.isTest) {
		logger.info(`Inserting tournament summary. ${tournamentSummaryString}`);
		addSummary({
			tournamentId,
			summary,
			season,
			badgeReceivers: data.badgeReceivers ?? undefined,
		});
	} else {
		logger.info(
			`Did not insert tournament summary. ${tournamentSummaryString}`,
		);
		finalizeTournament(tournamentId);
	}

	await updateSeriesTierHistory(tournament);

	if (tournament.ranked) {
		try {
			refreshUserSkills(season!);
		} catch (error) {
			logger.warn("Error refreshing user skills", error);
		}
	}

	if (data.badgeReceivers) {
		logger.info(
			`Badge receivers for tournament id ${tournamentId}: ${JSON.stringify(data.badgeReceivers)}`,
		);

		notifyBadgeReceivers(data.badgeReceivers);
	}

	clearTournamentDataCache(tournamentId);

	return successToastWithRedirect({
		url: tournamentBracketsPage({ tournamentId }),
		message: "Tournament finalized",
	});
};

async function requireValidBadgeReceivers(
	badgeReceivers: TournamentBadgeReceivers,
	tournament: Tournament,
) {
	const badges = (
		await CalendarRepository.findById(tournament.ctx.eventId, {
			includeBadgePrizes: true,
		})
	)?.badgePrizes;
	invariant(badges, "validateBadgeOwners: Event with badge prizes not found");

	const error = validateBadgeReceivers({
		badgeReceivers,
		badges,
	});

	if (error) {
		logger.warn(
			`validateBadgeOwners: Invalid badge receivers for tournament ${tournament.ctx.id}: ${error}`,
		);
		return false;
	}

	return true;
}

async function notifyBadgeReceivers(badgeReceivers: TournamentBadgeReceivers) {
	try {
		for (const receiver of badgeReceivers) {
			const badge = await BadgeRepository.findById(receiver.badgeId);
			invariant(badge, `Badge with id ${receiver.badgeId} not found`);

			notify({
				userIds: receiver.userIds,
				notification: {
					type: "BADGE_ADDED",
					meta: {
						badgeName: badge.displayName,
						badgeId: receiver.badgeId,
					},
				},
			});
		}
	} catch (error) {
		logger.error("Error notifying badge receivers", error);
	}
}

async function updateSeriesTierHistory(tournament: Tournament) {
	const organizationId = tournament.ctx.organization?.id;
	if (!organizationId) return;

	const tier = tournament.ctx.tier;
	if (tier === null) return;

	try {
		await TournamentOrganizationRepository.updateSeriesTierHistory({
			organizationId,
			eventName: tournament.ctx.name,
			newTier: tier,
		});
		await refreshTentativeTiersCache();
		logger.info(
			`Updated series tier history for tournament ${tournament.ctx.id} with tier ${tier}`,
		);
	} catch (error) {
		logger.error("Error updating series tier history", error);
	}
}
