import "dotenv/config";
import { type Rating, ordinal, rating } from "openskill";
import { db } from "../app/db/sql";
import type { Tables } from "../app/db/tables";
import { tournamentFromDB } from "../app/features/tournament-bracket/core/Tournament.server";
import { calculateIndividualPlayerSkills } from "../app/features/tournament-bracket/core/summarizer.server";
import { allMatchResultsByTournamentId } from "../app/features/tournament-bracket/queries/allMatchResultsByTournamentId.server";
import invariant from "../app/utils/invariant";
import { logger } from "../app/utils/logger";

async function main() {
	const result: Tables["SeedingSkill"][] = [];

	for (const type of ["RANKED", "UNRANKED"] as const) {
		const ratings = new Map<number, Rating>();
		let count = 0;

		console.time(`Tournament skills: ${type}`);
		for await (const tournament of tournaments(type)) {
			count++;
			const results = allMatchResultsByTournamentId(tournament.ctx.id);
			invariant(results.length > 0, "No results found");

			const skills = calculateIndividualPlayerSkills({
				queryCurrentUserRating(userId) {
					return ratings.get(userId) ?? rating();
				},
				results,
			});

			for (const { userId, mu, sigma } of skills) {
				ratings.set(userId, rating({ mu, sigma }));
			}
		}
		console.timeEnd(`Tournament skills: ${type}`);
		logger.info(`Processed ${count} tournaments`);

		for (const [userId, { mu, sigma }] of ratings) {
			result.push({
				mu,
				sigma,
				ordinal: ordinal(rating({ mu, sigma })),
				type,
				userId,
			});
		}
	}

	await db.transaction().execute(async (trx) => {
		await trx.deleteFrom("SeedingSkill").execute();
		for (const skill of result) {
			await trx.insertInto("SeedingSkill").values(skill).execute();
		}
	});
	logger.info(`Done. Total of ${result.length} seeding skills inserted`);
}

async function* tournaments(type: "RANKED" | "UNRANKED") {
	const maxId = await db
		.selectFrom("Tournament")
		.select(({ fn }) => fn.max("id").as("maxId"))
		.executeTakeFirstOrThrow()
		.then((row) => row.maxId);

	for (let tournamentId = 1; tournamentId <= maxId; tournamentId++) {
		try {
			const tournament = await tournamentFromDB({
				tournamentId,
				user: undefined,
			});

			if (!tournament.ctx.isFinalized) {
				continue;
			}

			if (tournament.skillCountsFor === "RANKED" && type === "RANKED") {
				yield tournament;
			} else if (
				tournament.skillCountsFor === "UNRANKED" &&
				type === "UNRANKED"
			) {
				yield tournament;
			}
		} catch (err) {
			// logger.info(`Skipped tournament with id ${tournamentId}`);
		}
	}
}

main();
