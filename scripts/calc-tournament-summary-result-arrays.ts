import "dotenv/config";
import { sql } from "kysely";
import { db } from "../app/db/sql";
import {
	setResults,
	type TournamentSummary,
} from "../app/features/tournament-bracket/core/summarizer.server";
import { tournamentFromDB } from "../app/features/tournament-bracket/core/Tournament.server";
import { allMatchResultsByTournamentId } from "../app/features/tournament-bracket/queries/allMatchResultsByTournamentId.server";
import invariant from "../app/utils/invariant";
import { logger } from "../app/utils/logger";

async function main() {
	logger.info(
		"Starting to fix tournamentTeamId in TournamentMatchGameResultParticipant",
	);
	await tournamentTeamIdsToTournamentMatchGameResultParticipantTable();
	logger.info("Fixed tournamentTeamId in TournamentMatchGameResultParticipant");

	const result: Array<
		{ tournamentId: number } & Pick<TournamentSummary, "setResults">
	> = [];

	let count = 0;
	for await (const tournament of tournaments()) {
		count++;
		const results = allMatchResultsByTournamentId(tournament.ctx.id);
		invariant(results.length > 0, "No results found");

		result.push({
			tournamentId: tournament.ctx.id,
			setResults: setResults({ results, teams: tournament.ctx.teams }),
		});

		if (count % 100 === 0) {
			logger.info(`Processed ${count} tournaments`);
		}
	}

	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentResult")
			.set({
				setResults: JSON.stringify([]),
			})
			.execute();
		for (const { tournamentId, setResults } of result) {
			for (const [userId, setResult] of setResults.entries()) {
				await trx
					.updateTable("TournamentResult")
					.set({
						setResults: JSON.stringify(setResult),
					})
					.where("tournamentId", "=", tournamentId)
					.where("userId", "=", userId)
					.execute();
			}
		}
	});
	logger.info(`Done. Total of ${result.length} results inserted.`);

	await wipeEmptyResults();
}

async function* tournaments() {
	const maxId = await db
		.selectFrom("Tournament")
		.select(({ fn }) => fn.max("id").as("maxId"))
		.executeTakeFirstOrThrow()
		.then((row) => row.maxId);

	for (let tournamentId = 1; tournamentId <= maxId; tournamentId++) {
		if (tournamentId === 1483) {
			// broken one
			continue;
		}

		try {
			const tournament = await tournamentFromDB({
				tournamentId,
				user: undefined,
			});

			if (!tournament.ctx.isFinalized) {
				continue;
			}

			yield tournament;
		} catch (thrown) {
			if (thrown instanceof Response) continue;

			throw thrown;
		}
	}
}

// https://github.com/sendou-ink/sendou.ink/commit/96781122e2c5f9cd90564c9b57a45b74557fc400
async function tournamentTeamIdsToTournamentMatchGameResultParticipantTable() {
	await db
		.updateTable("TournamentMatchGameResultParticipant")
		.set((eb) => ({
			tournamentTeamId: eb
				.selectFrom("TournamentTeamMember")
				.innerJoin(
					"TournamentTeam",
					"TournamentTeamMember.tournamentTeamId",
					"TournamentTeam.id",
				)
				// exclude teams that have not checked in
				.innerJoin(
					"TournamentTeamCheckIn",
					"TournamentTeamCheckIn.tournamentTeamId",
					"TournamentTeam.id",
				)
				.select("TournamentTeam.id")
				.whereRef(
					"TournamentTeamMember.userId",
					"=",
					"TournamentMatchGameResultParticipant.userId",
				)
				.whereRef(
					"TournamentTeam.tournamentId",
					"=",
					eb
						.selectFrom("TournamentMatchGameResult")
						.innerJoin(
							"TournamentMatch",
							"TournamentMatchGameResult.matchId",
							"TournamentMatch.id",
						)
						.innerJoin(
							"TournamentStage",
							"TournamentStage.id",
							"TournamentMatch.stageId",
						)
						.innerJoin(
							"Tournament",
							"Tournament.id",
							"TournamentStage.tournamentId",
						)
						.whereRef(
							"TournamentMatchGameResult.id",
							"=",
							"TournamentMatchGameResultParticipant.matchGameResultId",
						)
						.select("Tournament.id")
						.limit(1),
				),
		}))
		.where("TournamentMatchGameResultParticipant.tournamentTeamId", "is", null)
		.execute();

	// manual fixes, not sure why these are needed
	await db
		.updateTable("TournamentMatchGameResultParticipant")
		.set({
			tournamentTeamId: 13077,
		})
		.where("userId", "=", 44085)
		.where("tournamentTeamId", "is", null)
		.execute();

	await db
		.updateTable("TournamentMatchGameResultParticipant")
		.set({
			tournamentTeamId: 14589,
		})
		.where("userId", "=", 10585)
		.where("tournamentTeamId", "is", null)
		.execute();
}

async function wipeEmptyResults() {
	logger.info("Wiping empty results from TournamentResult table...");

	const { numDeletedRows } = await db
		.deleteFrom("TournamentResult")
		.where(sql<boolean>`instr(setResults, 'W') = 0`)
		.where(sql<boolean>`instr(setResults, 'L') = 0`)
		.executeTakeFirst();

	logger.info(
		`Wiped ${numDeletedRows} empty results from TournamentResult table.`,
	);
}

main().catch((err) => {
	logger.error("Error in calc-tournament-summary-result-arrays.ts", err);
	process.exit(1);
});
