import { db } from "~/db/sql";

/** Ids of every finalized tournament, oldest first. */
export async function finalizedTournamentIds() {
	const rows = await db
		.selectFrom("Tournament")
		.select("Tournament.id")
		.where("Tournament.isFinalized", "=", 1)
		.orderBy("Tournament.id", "asc")
		.execute();

	return rows.map((row) => row.id);
}

/** Every reported game of the tournament. */
export function gameResults(tournamentId: number) {
	return db
		.selectFrom("TournamentMatchGameResult")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchGameResult.matchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select([
			"TournamentMatchGameResult.matchId",
			"TournamentMatchGameResult.winnerTeamId",
			"TournamentMatchGameResult.createdAt",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.execute();
}

/** The per user results written when the tournament was finalized. */
export function storedResults(tournamentId: number) {
	return db
		.selectFrom("TournamentResult")
		.select([
			"TournamentResult.userId",
			"TournamentResult.tournamentTeamId",
			"TournamentResult.placement",
			"TournamentResult.participantCount",
			"TournamentResult.div",
			"TournamentResult.setResults",
		])
		.where("TournamentResult.tournamentId", "=", tournamentId)
		.execute();
}
