import { differenceInHours } from "date-fns";
import * as Seasons from "~/features/mmr/core/Seasons";
import { seasonRatings, seedingRatings } from "~/features/mmr/mmr-utils.server";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import * as Standings from "~/features/tournament/core/Standings";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { refreshTentativeTiersCache } from "~/features/tournament-organization/core/tentativeTiers.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type {
	TournamentBadgeReceivers,
	TournamentTrophyReceiver,
} from "../tournament-bracket-schemas.server";
import { summaryRatingTargets, tournamentSummary } from "./summarizer.server";
import type { Tournament } from "./Tournament";
import { clearTournamentDataCache } from "./Tournament.server";

/** Finalizes a fully played tournament with a real summary: results, skills, badges,
 * trophies and leaderboard entries. */
export async function finalizeTournament({
	tournament,
	badgeReceivers,
	trophyReceiver,
}: {
	tournament: Tournament;
	badgeReceivers?: TournamentBadgeReceivers;
	trophyReceiver?: TournamentTrophyReceiver;
}) {
	const tournamentId = tournament.ctx.id;

	const results =
		await TournamentMatchRepository.findAllResultsByTournamentId(tournamentId);
	invariant(results.length > 0, "No results found");

	const season = resolveFinalizationSeason(tournament);

	const seedingSkillCountsFor = tournament.skillCountsFor;
	const standingsResult = Standings.tournamentStandings(tournament);
	const finalStandings = Standings.flattenStandings(standingsResult);

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

	const summary = tournamentSummary({
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

	const tournamentSummaryString = `Tournament id: ${tournamentId}, mapResultDeltas.lenght: ${summary.mapResultDeltas.length}, playerResultDeltas.length ${summary.playerResultDeltas.length}, tournamentResults.length ${summary.tournamentResults.length}, skills.length ${summary.skills.length}, seedingSkills.length ${summary.seedingSkills.length}`;
	if (!tournament.isTest) {
		logger.info(`Inserting tournament summary. ${tournamentSummaryString}`);
		await TournamentRepository.finalize({
			tournamentId,
			summary,
			season,
			badgeReceivers,
			trophyReceiver,
		});
	} else {
		logger.info(
			`Did not insert tournament summary. ${tournamentSummaryString}`,
		);
		await TournamentRepository.finalizeWithoutSummary(tournamentId);
	}

	await SavedCalendarEventRepository.deleteByTournamentId(tournamentId);

	if (!tournament.isTest) {
		await updateSeriesTierHistory(tournament);
	}

	if (tournament.ranked && typeof season === "number") {
		try {
			await refreshUserSkills(season);
		} catch (error) {
			logger.warn("Error refreshing user skills", error);
		}
	}

	clearTournamentDataCache(tournamentId);
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

function resolveFinalizationSeason(tournament: Tournament) {
	// league divisions might be running for many weeks
	const attributionDate = tournament.isLeagueDivision
		? new Date()
		: tournament.ctx.startsAt;
	const season = Seasons.current(attributionDate);
	if (!season) return undefined;

	// don't allow changing seasons that have already been closed for a long while
	// even if you were sluggish with finalizing the tournament
	if (differenceInHours(new Date(), season.ends) >= 24) return undefined;

	return season.nth;
}
