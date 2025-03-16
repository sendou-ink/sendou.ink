import { db } from "~/db/sql";

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
