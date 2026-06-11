import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import { TournamentMatchStatus, type TournamentRoundMaps } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import type { Unwrapped } from "~/utils/types";

const opponentOneId = sql<number>`"TournamentMatch"."opponentOne" ->> '$.id'`;
const opponentTwoId = sql<number>`"TournamentMatch"."opponentTwo" ->> '$.id'`;
const opponentOneScore = sql<
	number | null
>`"TournamentMatch"."opponentOne" ->> '$.score'`;
const opponentTwoScore = sql<
	number | null
>`"TournamentMatch"."opponentTwo" ->> '$.score'`;
const opponentOneResult = sql<
	"win" | "loss"
>`"TournamentMatch"."opponentOne" ->> '$.result'`;
const opponentTwoResult = sql<
	"win" | "loss"
>`"TournamentMatch"."opponentTwo" ->> '$.result'`;

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
			"Tournament.id as tournamentId",
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
		opponentOne: normalizeOpponent(row.opponentOne),
		opponentTwo: normalizeOpponent(row.opponentTwo),
		bestOf: row.roundMaps.count,
	};
}

// Kysely's ParseJSONResultsPlugin only parses strings starting with `[` or `{`,
// so the JSON `null` stored for BYE opponents survives as the literal text "null".
function normalizeOpponent<T>(value: T): T | null {
	return (value as unknown) === "null" ? null : value;
}

export function findResultById(id: number) {
	return db
		.selectFrom("TournamentMatchGameResult")
		.select([
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResult.matchId",
			"TournamentMatchGameResult.opponentOnePoints",
			"TournamentMatchGameResult.opponentTwoPoints",
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
			"TournamentMatchGameResult.opponentOnePoints",
			"TournamentMatchGameResult.opponentTwoPoints",
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

interface AllMatchResultOpponent {
	id: number;
	score: number;
	result: "win" | "loss";
	droppedOut: boolean;
	activeRosterUserIds: number[] | null;
	memberUserIds: number[];
}
export interface AllMatchResult {
	opponentOne: AllMatchResultOpponent;
	opponentTwo: AllMatchResultOpponent;
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

export async function allResultsByTournamentId(
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
			opponentOneResult.as("opponentOneResult"),
			opponentTwoResult.as("opponentTwoResult"),
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
		.where(opponentOneResult, "is not", null)
		// strictly speaking the order by condition is not accurate, future improvement would be to add order conditions that match the tournament structure
		.orderBy("TournamentMatch.id", "asc")
		.execute();

	return rows.map((row) => {
		const opponentOne: AllMatchResultOpponent = {
			id: row.opponentOneId,
			score: row.opponentOneScore,
			result: row.opponentOneResult,
			droppedOut: row.opponentOneDroppedOut === 1,
			activeRosterUserIds: row.opponentOneActiveRoster,
			memberUserIds: row.opponentOneMembers.map((member) => member.userId),
		};
		const opponentTwo: AllMatchResultOpponent = {
			id: row.opponentTwoId,
			score: row.opponentTwoScore,
			result: row.opponentTwoResult,
			droppedOut: row.opponentTwoDroppedOut === 1,
			activeRosterUserIds: row.opponentTwoActiveRoster,
			memberUserIds: row.opponentTwoMembers.map((member) => member.userId),
		};

		return {
			opponentOne,
			opponentTwo,
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
		.orderBy("TournamentRound.stageId", "asc")
		.orderBy("TournamentGroup.number", "asc")
		.orderBy("TournamentRound.number", "asc")
		.execute();
}
