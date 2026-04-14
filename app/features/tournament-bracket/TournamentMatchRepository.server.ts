import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { Unwrapped } from "~/utils/types";

export type FindMatchById = NonNullable<Unwrapped<typeof findMatchById>>;
export async function findMatchById(id: number) {
	const row = await db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"TournamentRound",
			"TournamentRound.id",
			"TournamentMatch.roundId",
		)
		.innerJoin("Tournament", "Tournament.id", "TournamentStage.tournamentId")
		.select(({ eb }) => [
			"TournamentMatch.id",
			"TournamentMatch.groupId",
			"TournamentMatch.opponentOne",
			"TournamentMatch.opponentTwo",
			"TournamentMatch.chatCode",
			"TournamentMatch.startedAt",
			"TournamentMatch.status",
			"Tournament.mapPickingStyle",
			"TournamentRound.id as roundId",
			"TournamentRound.maps as roundMaps",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.innerJoin("User", "User.id", "TournamentTeamMember.userId")
					.select([
						"User.id",
						"User.username",
						"TournamentTeamMember.tournamentTeamId",
						sql<
							string | null
						>`coalesce("TournamentTeamMember"."inGameName", "User"."inGameName")`.as(
							"inGameName",
						),
						"User.discordId",
						"User.customUrl",
						"User.discordAvatar",
						"User.pronouns",
					])
					.where(({ or, eb: innerEb }) =>
						or([
							innerEb(
								"TournamentTeamMember.tournamentTeamId",
								"=",
								sql<number>`"TournamentMatch"."opponentOne" ->> '$.id'`,
							),
							innerEb(
								"TournamentTeamMember.tournamentTeamId",
								"=",
								sql<number>`"TournamentMatch"."opponentTwo" ->> '$.id'`,
							),
						]),
					),
			).as("players"),
		])
		.where("TournamentMatch.id", "=", id)
		.executeTakeFirst();

	if (!row) return;

	return {
		...row,
		bestOf: row.roundMaps.count,
	};
}

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
