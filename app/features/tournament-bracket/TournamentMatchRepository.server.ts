import { db } from "~/db/sql";
import { databaseTimestampNow } from "~/utils/dates";

export function findResultById(id: number) {
	return db
		.selectFrom("TournamentMatchGameResult")
		.select([
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResult.opponentOnePoints",
			"TournamentMatchGameResult.opponentTwoPoints",
		])
		.where("TournamentMatchGameResult.id", "=", id)
		.executeTakeFirst();
}

export async function userParticipationByTournamentId(tournamentId: number) {
	return db
		.with("playerMatches", (db) =>
			db
				.selectFrom("TournamentMatchGameResultParticipant as Participant")
				.innerJoin(
					"TournamentMatchGameResult as GameResult",
					"GameResult.id",
					"Participant.matchGameResultId",
				)
				.innerJoin("TournamentMatch as Match", "Match.id", "GameResult.matchId")
				.innerJoin("TournamentStage as Stage", "Stage.id", "Match.stageId")
				.select(["Participant.userId", "GameResult.matchId"])
				.where("Stage.tournamentId", "=", tournamentId)
				.distinct(),
		)
		.selectFrom("playerMatches")
		.select(({ fn, ref }) => [
			"playerMatches.userId",
			fn
				.agg<number[]>("json_group_array", [ref("playerMatches.matchId")])
				.as("matchIds"),
		])
		.groupBy("playerMatches.userId")
		.execute();
}

/**
 * Marks tournament matches as started by setting their startedAt timestamp to the current time.
 * @param ids - Array of tournament match IDs to mark as started
 */
export function markManyAsStarted(ids: number[]) {
	return db
		.updateTable("TournamentMatch")
		.set({ startedAt: databaseTimestampNow() })
		.where("id", "in", ids)
		.execute();
}
