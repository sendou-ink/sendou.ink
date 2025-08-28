import { db } from "~/db/sql";

export type TournamentParticipant = {
	userId: number;
	matchIds: number[];
};

export async function tournamentParticipantsByTournamentId(
	tournamentId: number,
): Promise<TournamentParticipant[]> {
	const rows = await db
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

	return rows.map((row) => ({
		userId: row.userId as number,
		matchIds: row.matchIds,
	}));
}
