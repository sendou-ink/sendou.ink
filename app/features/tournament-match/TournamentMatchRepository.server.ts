import { type Insertable, sql, type Transaction } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type { TournamentRoundMaps } from "~/db/tables-json";
import type { Side } from "~/features/tournament-bracket/core/engine/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { customAvatarUrl } from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
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
			"TournamentMatch.winnerSide",
			"TournamentMatch.chatCode",
			"TournamentMatch.startedAt",
			"Tournament.mapPickingStyle",
			"TournamentRound.id as roundId",
			"TournamentRound.maps as roundMaps",
			"Tournament.id as tournamentId",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.innerJoin("User", "User.id", "TournamentTeamMember.userId")
					.select((eb) => [
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
						customAvatarUrl(eb).as("customAvatarUrl"),
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
			"TournamentMatchGameResult.matchId",
			"TournamentMatchGameResult.ko",
			"TournamentMatchGameResult.winnerTeamId",
		])
		.where("TournamentMatchGameResult.id", "=", id)
		.executeTakeFirst();
}

export function findResultsByMatchId(matchId: number) {
	return db
		.selectFrom("TournamentMatchGameResult")
		.select(({ eb }) => [
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResult.winnerTeamId",
			"TournamentMatchGameResult.stageId",
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.source",
			"TournamentMatchGameResult.createdAt",
			"TournamentMatchGameResult.ko",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResultParticipant")
					.select([
						"TournamentMatchGameResultParticipant.tournamentTeamId",
						"TournamentMatchGameResultParticipant.userId",
					])
					.whereRef(
						"TournamentMatchGameResultParticipant.matchGameResultId",
						"=",
						"TournamentMatchGameResult.id",
					),
			).as("participants"),
		])
		.where("TournamentMatchGameResult.matchId", "=", matchId)
		.orderBy("TournamentMatchGameResult.number", "asc")
		.execute();
}

/** Inserts a single game result, returning the id it was given. */
export function insertResult(
	args: Insertable<DB["TournamentMatchGameResult"]>,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.insertInto("TournamentMatchGameResult")
		.values(args)
		.returning("id")
		.executeTakeFirstOrThrow();
}

/** Updates the KO status of a single game result. */
export function updateResultKo(
	args: { id: number; ko: boolean },
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.updateTable("TournamentMatchGameResult")
		.set({ ko: toDBBoolean(args.ko) })
		.where("TournamentMatchGameResult.id", "=", args.id)
		.execute();
}

/** Sets the players who participated in a game result, replacing any existing ones. */
export async function setParticipants(
	args: {
		resultId: number;
		participants: Array<
			Pick<
				Insertable<DB["TournamentMatchGameResultParticipant"]>,
				"userId" | "tournamentTeamId"
			>
		>;
	},
	trx: Transaction<DB>,
) {
	await trx
		.deleteFrom("TournamentMatchGameResultParticipant")
		.where(
			"TournamentMatchGameResultParticipant.matchGameResultId",
			"=",
			args.resultId,
		)
		.execute();

	await trx
		.insertInto("TournamentMatchGameResultParticipant")
		.values(
			args.participants.map((participant) => ({
				...participant,
				matchGameResultId: args.resultId,
			})),
		)
		.execute();
}

/** Deletes a single game result by its id. */
export function deleteResultById(id: number, trx?: Transaction<DB>) {
	return (trx ?? db)
		.deleteFrom("TournamentMatchGameResult")
		.where("TournamentMatchGameResult.id", "=", id)
		.execute();
}

/** Deletes all pick/ban events belonging to a match. */
export function deletePickBanEventsByMatchId(
	matchId: number,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.deleteFrom("TournamentMatchPickBanEvent")
		.where("TournamentMatchPickBanEvent.matchId", "=", matchId)
		.execute();
}

/** Deletes a single pick/ban event by its match and event number. */
export function deletePickBanEvent(
	args: { matchId: number; number: number },
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.deleteFrom("TournamentMatchPickBanEvent")
		.where("TournamentMatchPickBanEvent.matchId", "=", args.matchId)
		.where("TournamentMatchPickBanEvent.number", "=", args.number)
		.execute();
}

interface AllMatchResultOpponent {
	id: number;
	score: number;
	droppedOut: boolean;
	activeRosterUserIds: number[] | null;
	memberUserIds: number[];
}
export interface AllMatchResult {
	opponentOne: AllMatchResultOpponent;
	opponentTwo: AllMatchResultOpponent;
	winnerSide: Side;
	roundMaps: TournamentRoundMaps;
	maps: Array<{
		stageId: StageId;
		mode: ModeShort;
		winnerTeamId: number;
		participants: Array<{
			// in the DB this can actually also be null, but for new tournaments it should always be a number
			tournamentTeamId: number;
			userId: number;
		}>;
	}>;
}

export async function findAllResultsByTournamentId(
	tournamentId: number,
): Promise<AllMatchResult[]> {
	const rows = await db
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
		.innerJoin("TournamentTeam as Team1", (join) =>
			join.on((eb) => eb(opponentOneId, "=", eb.ref("Team1.id"))),
		)
		.innerJoin("TournamentTeam as Team2", (join) =>
			join.on((eb) => eb(opponentTwoId, "=", eb.ref("Team2.id"))),
		)
		.select(({ eb }) => [
			opponentOneId.as("opponentOneId"),
			opponentTwoId.as("opponentTwoId"),
			sql<number>`"TournamentMatch"."opponentOne" ->> '$.score'`.as(
				"opponentOneScore",
			),
			sql<number>`"TournamentMatch"."opponentTwo" ->> '$.score'`.as(
				"opponentTwoScore",
			),
			"TournamentMatch.winnerSide",
			"TournamentRound.maps as roundMaps",
			"Team1.droppedOut as opponentOneDroppedOut",
			"Team2.droppedOut as opponentTwoDroppedOut",
			"Team1.activeRosterUserIds as opponentOneActiveRoster",
			"Team2.activeRosterUserIds as opponentTwoActiveRoster",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.select("TournamentTeamMember.userId")
					.whereRef("TournamentTeamMember.tournamentTeamId", "=", "Team1.id"),
			).as("opponentOneMembers"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.select("TournamentTeamMember.userId")
					.whereRef("TournamentTeamMember.tournamentTeamId", "=", "Team2.id"),
			).as("opponentTwoMembers"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResult")
					.select(({ eb: innerEb }) => [
						"TournamentMatchGameResult.stageId",
						"TournamentMatchGameResult.mode",
						"TournamentMatchGameResult.winnerTeamId",
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentMatchGameResultParticipant")
								.select([
									"TournamentMatchGameResultParticipant.tournamentTeamId",
									"TournamentMatchGameResultParticipant.userId",
								])
								.whereRef(
									"TournamentMatchGameResultParticipant.matchGameResultId",
									"=",
									"TournamentMatchGameResult.id",
								),
						).as("participants"),
					])
					.whereRef(
						"TournamentMatchGameResult.matchId",
						"=",
						"TournamentMatch.id",
					)
					.orderBy("TournamentMatchGameResult.number", "asc"),
			).as("maps"),
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.where("TournamentMatch.winnerSide", "is not", null)
		// strictly speaking the order by condition is not accurate, future improvement would be to add order conditions that match the tournament structure
		.orderBy("TournamentMatch.id", "asc")
		.execute();

	return rows.map((row) => {
		const opponentOne: AllMatchResultOpponent = {
			id: row.opponentOneId,
			score: row.opponentOneScore,
			droppedOut: row.opponentOneDroppedOut === 1,
			activeRosterUserIds: row.opponentOneActiveRoster,
			memberUserIds: row.opponentOneMembers.map((member) => member.userId),
		};
		const opponentTwo: AllMatchResultOpponent = {
			id: row.opponentTwoId,
			score: row.opponentTwoScore,
			droppedOut: row.opponentTwoDroppedOut === 1,
			activeRosterUserIds: row.opponentTwoActiveRoster,
			memberUserIds: row.opponentTwoMembers.map((member) => member.userId),
		};

		invariant(row.winnerSide, "Match has no winner");

		return {
			opponentOne,
			opponentTwo,
			winnerSide: row.winnerSide,
			roundMaps: row.roundMaps,
			maps: row.maps.map((map) => {
				invariant(map.participants.length > 0, "No participants found");
				invariant(
					map.participants.every(
						(participant) => typeof participant.tournamentTeamId === "number",
					),
					"Some participants have no team id",
				);
				invariant(
					map.participants.every(
						(participant) =>
							participant.tournamentTeamId === row.opponentOneId ||
							participant.tournamentTeamId === row.opponentTwoId,
					),
					"Some participants have an invalid team id",
				);

				return map;
			}),
		};
	});
}

export async function findUserParticipationByTournamentId(
	tournamentId: number,
) {
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
					.select((eb) => [
						"User.id",
						"User.username",
						"User.discordAvatar",
						"User.discordId",
						"User.customUrl",
						customAvatarUrl(eb).as("customAvatarUrl"),
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
		.where("TournamentMatch.winnerSide", "is not", null)
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
		.orderBy("TournamentRound.stageId", "asc")
		.orderBy("TournamentGroup.number", "asc")
		.orderBy("TournamentRound.number", "asc")
		.execute();
}
