import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import { TournamentMatchStatus } from "~/db/tables";
import type { Unwrapped } from "~/utils/types";

const opponentOneId = sql<number>`"TournamentMatch"."opponentOne" ->> '$.id'`;
const opponentTwoId = sql<number>`"TournamentMatch"."opponentTwo" ->> '$.id'`;
const opponentOneScore = sql<
	number | null
>`"TournamentMatch"."opponentOne" ->> '$.score'`;
const opponentTwoScore = sql<
	number | null
>`"TournamentMatch"."opponentTwo" ->> '$.score'`;

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
								opponentOneId,
							),
							innerEb(
								"TournamentTeamMember.tournamentTeamId",
								"=",
								opponentTwoId,
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
			"TournamentMatchGameResult.winnerTeamId",
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

export type FindByTournamentTeamIdItem = Unwrapped<
	typeof findByTournamentTeamId
>;
export function findByTournamentTeamId(tournamentTeamId: number) {
	return db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentRound",
			"TournamentRound.id",
			"TournamentMatch.roundId",
		)
		.innerJoin(
			"TournamentGroup",
			"TournamentGroup.id",
			"TournamentMatch.groupId",
		)
		.innerJoin("TournamentTeam as otherTeam", (join) =>
			join.on((eb) =>
				eb.or([
					eb.and([
						eb(opponentOneId, "!=", tournamentTeamId),
						eb(opponentOneId, "=", eb.ref("otherTeam.id")),
					]),
					eb.and([
						eb(opponentTwoId, "!=", tournamentTeamId),
						eb(opponentTwoId, "=", eb.ref("otherTeam.id")),
					]),
				]),
			),
		)
		.select(({ eb }) => [
			"TournamentMatch.id as tournamentMatchId",
			opponentOneScore.as("opponentOneScore"),
			opponentTwoScore.as("opponentTwoScore"),
			"otherTeam.name as otherTeamName",
			"otherTeam.id as otherTeamId",
			"TournamentRound.number as roundNumber",
			"TournamentRound.stageId",
			"TournamentGroup.number as groupNumber",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResult")
					.select([
						"TournamentMatchGameResult.mode",
						"TournamentMatchGameResult.stageId",
						"TournamentMatchGameResult.source",
						sql<number>`"TournamentMatchGameResult"."winnerTeamId" = ${tournamentTeamId}`.as(
							"wasWinner",
						),
					])
					.whereRef(
						"TournamentMatchGameResult.matchId",
						"=",
						"TournamentMatch.id",
					)
					.orderBy("TournamentMatchGameResult.number", "asc"),
			).as("matches"),
			jsonArrayFrom(
				eb
					.selectFrom("User")
					.innerJoin(
						"TournamentMatchGameResultParticipant",
						"TournamentMatchGameResultParticipant.userId",
						"User.id",
					)
					.innerJoin(
						"TournamentMatchGameResult",
						"TournamentMatchGameResult.id",
						"TournamentMatchGameResultParticipant.matchGameResultId",
					)
					.innerJoin("TournamentTeamMember", (join) =>
						join
							.onRef("TournamentTeamMember.userId", "=", "User.id")
							.onRef(
								"TournamentTeamMember.tournamentTeamId",
								"=",
								"otherTeam.id",
							),
					)
					.select([
						"User.id",
						"User.username",
						"User.discordAvatar",
						"User.discordId",
						"User.customUrl",
					])
					.whereRef(
						"TournamentMatchGameResult.matchId",
						"=",
						"TournamentMatch.id",
					)
					.distinct(),
			).as("players"),
		])
		.where((eb) =>
			eb.or([
				eb(opponentOneId, "=", tournamentTeamId),
				eb(opponentTwoId, "=", tournamentTeamId),
			]),
		)
		.where("TournamentMatch.status", ">=", TournamentMatchStatus.Completed)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("TournamentMatchGameResult")
					.select("TournamentMatchGameResult.id")
					.whereRef(
						"TournamentMatchGameResult.matchId",
						"=",
						"TournamentMatch.id",
					),
			),
		)
		.orderBy("TournamentGroup.number", "asc")
		.orderBy("TournamentRound.number", "asc")
		.execute();
}
