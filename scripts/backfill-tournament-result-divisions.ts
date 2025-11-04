import "dotenv/config";
import { db } from "../app/db/sql";
import * as Seasons from "../app/features/mmr/core/Seasons";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryCurrentUserSeedingRating,
	queryTeamPlayerRatingAverage,
} from "../app/features/mmr/mmr-utils.server";
import * as Standings from "../app/features/tournament/core/Standings";
import { tournamentSummary } from "../app/features/tournament-bracket/core/summarizer.server";
import { tournamentFromDB } from "../app/features/tournament-bracket/core/Tournament.server";
import { allMatchResultsByTournamentId } from "../app/features/tournament-bracket/queries/allMatchResultsByTournamentId.server";
import invariant from "../app/utils/invariant";
import { logger } from "../app/utils/logger";

async function main() {
	logger.info("Starting to backfill tournament result divisions");

	const tournaments = await db
		.selectFrom("Tournament")
		.select("id")
		.where("isFinalized", "=", 1)
		.execute();

	let recalculatedCount = 0;
	let skippedCount = 0;

	for (const { id: tournamentId } of tournaments) {
		try {
			const tournament = await tournamentFromDB({
				tournamentId,
				user: undefined,
			});

			const uniqueStartingBracketIndexes = new Set(
				tournament.ctx.teams
					.map((team) => team.startingBracketIdx)
					.filter((idx) => idx !== null && idx !== undefined),
			);

			if (uniqueStartingBracketIndexes.size <= 1) {
				skippedCount++;
				continue;
			}

			recalculatedCount++;

			await db
				.deleteFrom("TournamentResult")
				.where("tournamentId", "=", tournamentId)
				.execute();

			const results = allMatchResultsByTournamentId(tournamentId);
			invariant(results.length > 0, "No results found");

			const season = Seasons.current(tournament.ctx.startTime)?.nth;
			const seedingSkillCountsFor = tournament.skillCountsFor;

			const standingsResult = Standings.tournamentStandings(tournament);
			if (standingsResult.type === "single") {
				throw new Error(
					`Expected multiple starting brackets for tournament ${tournamentId}`,
				);
			}
			const finalStandings = Standings.flattenStandings(standingsResult);
			const summary = tournamentSummary({
				teams: tournament.ctx.teams,
				finalStandings,
				results,
				calculateSeasonalStats: false,
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

			logger.info(
				`Inserting ${summary.tournamentResults.length} results for tournament ${tournamentId}`,
			);
			for (const tournamentResult of summary.tournamentResults) {
				const setResults = summary.setResults.get(tournamentResult.userId);

				if (setResults?.every((result) => !result)) {
					continue;
				}

				await db
					.insertInto("TournamentResult")
					.values({
						tournamentId,
						userId: tournamentResult.userId,
						placement: tournamentResult.placement,
						participantCount: tournamentResult.participantCount,
						tournamentTeamId: tournamentResult.tournamentTeamId,
						setResults: setResults ? JSON.stringify(setResults) : "[]",
						spDiff: null,
						div: tournamentResult.div,
					})
					.execute();
			}

			if (recalculatedCount % 10 === 0) {
				logger.info(
					`Processed ${recalculatedCount} tournaments with multiple starting brackets (skipped ${skippedCount})`,
				);
			}
		} catch (thrown) {
			if (thrown instanceof Response) continue;

			logger.error(`Error processing tournament ${tournamentId}`, thrown);
		}
	}

	logger.info(
		`Done. Recalculated ${recalculatedCount} tournaments with multiple starting brackets. Skipped ${skippedCount} tournaments.`,
	);
}

main().catch((err) => {
	logger.error("Error in backfill-tournament-result-divisions.ts", err);
	process.exit(1);
});
