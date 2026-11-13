import { db } from "~/db/sql";

/** Casters by their user ids, in no particular order. */
export function findAllCastersByUserIds(userIds: number[]) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("User")
		.select(["User.id as userId", "User.username as name", "User.pronouns"])
		.where("User.id", "in", userIds)
		.execute();
}

/** Reported games of the matches, each match's in playing order. */
export function findAllGameResultsByMatchIds(matchIds: number[]) {
	if (matchIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TournamentMatchGameResult")
		.select([
			"TournamentMatchGameResult.matchId",
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.stageId",
			"TournamentMatchGameResult.winnerTeamId",
		])
		.where("TournamentMatchGameResult.matchId", "in", matchIds)
		.orderBy("TournamentMatchGameResult.matchId", "asc")
		.orderBy("TournamentMatchGameResult.number", "asc")
		.execute();
}

/** Maps the team picked for the tournament's map lists. */
export function findMapPoolByTournamentTeamId(tournamentTeamId: number) {
	return db
		.selectFrom("MapPoolMap")
		.select(["MapPoolMap.mode", "MapPoolMap.stageId"])
		.where("MapPoolMap.tournamentTeamId", "=", tournamentTeamId)
		.execute();
}
