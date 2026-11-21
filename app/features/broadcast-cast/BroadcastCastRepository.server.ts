import { db } from "~/db/sql";
import { userAvatar } from "~/utils/kysely.server";

/** Casters by their user ids, in no particular order. */
export function findAllCastersByUserIds(userIds: number[]) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("User")
		.select((eb) => [
			"User.id as userId",
			"User.username as name",
			"User.pronouns",
			"User.customUrl",
			userAvatar(eb).as("avatar"),
		])
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

/** When each of the matches had its last game reported, matches with no games left out. */
export function findAllLastGameReportedAtByMatchIds(matchIds: number[]) {
	if (matchIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TournamentMatchGameResult")
		.select(({ fn }) => [
			"TournamentMatchGameResult.matchId",
			fn.max("TournamentMatchGameResult.createdAt").as("lastReportedAt"),
		])
		.where("TournamentMatchGameResult.matchId", "in", matchIds)
		.groupBy("TournamentMatchGameResult.matchId")
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
