import {
	type ExpressionBuilder,
	type NotNull,
	sql,
	type Transaction,
} from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, type QueryRow, refine } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { TournamentRoundMaps } from "~/db/tables-json";
import type { Side } from "~/features/tournament-bracket/core/engine/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { invariant } from "~/utils/invariant";
import {
	asBoolean,
	commonUserSelect,
	jsonArrayFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";

const opponentOneId = sql<number>`"TournamentMatch"."opponentOne" ->> '$.id'`;
const opponentTwoId = sql<number>`"TournamentMatch"."opponentTwo" ->> '$.id'`;
const opponentOneScore = sql<
	number | null
>`"TournamentMatch"."opponentOne" ->> '$.score'`;
const opponentTwoScore = sql<
	number | null
>`"TournamentMatch"."opponentTwo" ->> '$.score'`;

const matchTable = crud("TournamentMatch");
const resultTable = crud("TournamentMatchGameResult");
const participantTable = crud("TournamentMatchGameResultParticipant");
const pickBanEventTable = crud("TournamentMatchPickBanEvent");
const proposalTable = crud("TournamentMatchScheduleProposal");

export const {
	findById: findResultById,
	insert: insertResult,
	updateById: updateResultById,
	deleteById: deleteResultById,
} = resultTable;
export const { delete: deletePickBanEvents } = pickBanEventTable;
export const {
	findById: findScheduleProposalById,
	delete: deleteScheduleProposals,
} = proposalTable;

/** Tournament matches, in no particular order unless a step sorts. */
export const matches = defineQuery({
	root: "TournamentMatch",
	// opponents are a step: a tournament's matches are listed without them on hot paths, parsing their JSON is most of the read
	select: (qb) => qb.select(["TournamentMatch.id"]),
	vocabulary: () => ({
		/** Both opponents (`null` for a BYE or a slot still waiting for its team) and the side that won, `null` while undecided. */
		withOpponents: () =>
			refine("TournamentMatch", (qb) =>
				qb.select([
					"TournamentMatch.opponentOne",
					"TournamentMatch.opponentTwo",
					"TournamentMatch.winnerSide",
				]),
			),
		ofTournament: (tournamentId: number) =>
			refine("TournamentMatch", (qb) =>
				qb.where("TournamentMatch.stageId", "in", (eb) =>
					eb
						.selectFrom("TournamentStage")
						.select("TournamentStage.id")
						.where("TournamentStage.tournamentId", "=", tournamentId),
				),
			),
		undecided: () =>
			refine("TournamentMatch", (qb) =>
				qb.where("TournamentMatch.winnerSide", "is", null),
			),
		/** Leagues: sets the teams agreed to play at or after `startsAt` and before `endsAt`. */
		scheduledBetween: (startsAt: number, endsAt: number) =>
			refine("TournamentMatch", (qb) =>
				qb
					.where("TournamentMatch.scheduledAt", ">=", startsAt)
					.where("TournamentMatch.scheduledAt", "<", endsAt),
			),
		/** The id of the tournament the match is played in. */
		withTournamentId: () =>
			refine("TournamentMatch", (qb) =>
				qb.select((eb) =>
					stageOf(eb)
						.select("TournamentStage.tournamentId")
						.$asScalar()
						.$notNull()
						.as("tournamentId"),
				),
			),
		withMapPickingStyle: () =>
			refine("TournamentMatch", (qb) =>
				qb.select((eb) =>
					eb
						.selectFrom("Tournament")
						.select("Tournament.mapPickingStyle")
						.where("Tournament.id", "=", (tournamentEb) =>
							stageOf(tournamentEb).select("TournamentStage.tournamentId"),
						)
						.$asScalar()
						.$notNull()
						.as("mapPickingStyle"),
				),
			),
		/** The round's maps (`roundMaps`, `bestOf` their count) and when a league round opens (`roundIsPlayableAt`). */
		withRoundMaps: () =>
			refine("TournamentMatch", (qb) =>
				qb.select((eb) => [
					roundOf(eb)
						.select("TournamentRound.maps")
						.$asScalar()
						.$notNull()
						.as("roundMaps"),
					roundOf(eb)
						.select("TournamentRound.isPlayableAt")
						.$asScalar()
						.as("roundIsPlayableAt"),
				]),
			).mapRows(({ roundMaps, roundIsPlayableAt }) => ({
				roundMaps,
				roundIsPlayableAt,
				bestOf: roundMaps.count,
			})),
		/** When the last game was reported, `null` before the first one. */
		withLastResultAt: () =>
			refine("TournamentMatch", (qb) =>
				qb.select((eb) =>
					eb
						.selectFrom("TournamentMatchGameResult")
						.select(({ fn }) =>
							fn.max("TournamentMatchGameResult.createdAt").as("lastResultAt"),
						)
						.whereRef(
							"TournamentMatchGameResult.matchId",
							"=",
							"TournamentMatch.id",
						)
						.as("lastResultAt"),
				),
			),
		/** Both teams' names and the user ids of their members. */
		withTeams: () =>
			refine("TournamentMatch", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentTeam")
							.select((teamEb) => [
								"TournamentTeam.id",
								"TournamentTeam.name",
								jsonArrayFrom(
									teamEb
										.selectFrom("TournamentTeamMember")
										.select("TournamentTeamMember.userId")
										.whereRef(
											"TournamentTeamMember.tournamentTeamId",
											"=",
											"TournamentTeam.id",
										),
								).as("members"),
							])
							.where((teamEb) =>
								teamEb.or([
									teamEb("TournamentTeam.id", "=", opponentOneId),
									teamEb("TournamentTeam.id", "=", opponentTwoId),
								]),
							),
					).as("teams"),
				),
			),
		/** Members of both teams with their in-game names and pronouns. */
		withPlayers: () =>
			refine("TournamentMatch", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentTeamMember")
							.innerJoin("User", "User.id", "TournamentTeamMember.userId")
							.select((memberEb) => [
								...commonUserSelect(memberEb, { inTournament: true }),
								"TournamentTeamMember.tournamentTeamId",
								sql<
									string | null
								>`coalesce("TournamentTeamMember"."inGameName", "User"."inGameName")`.as(
									"inGameName",
								),
								"User.pronouns",
							])
							.where((memberEb) =>
								memberEb.or([
									memberEb(
										"TournamentTeamMember.tournamentTeamId",
										"=",
										opponentOneId,
									),
									memberEb(
										"TournamentTeamMember.tournamentTeamId",
										"=",
										opponentTwoId,
									),
								]),
							),
					).as("players"),
				),
			),
	}),
});

export type MatchById = QueryRow<ReturnType<typeof matchById>>;

/** What the match page needs of the match: its round, scheduling, tournament and both teams' players. */
export function matchById(matchId: number) {
	return matches()
		.where({ id: matchId })
		.withOpponents()
		.withColumns([
			"groupId",
			"roundId",
			"chatRoomId",
			"startedAt",
			"scheduledAt",
			"scheduleSetByOrganizer",
		])
		.withTournamentId()
		.withMapPickingStyle()
		.withRoundMaps()
		.withPlayers();
}

/** Reported games of matches in the order they were played. */
export const gameResults = defineQuery({
	root: "TournamentMatchGameResult",
	select: (qb) =>
		qb.select([
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResult.winnerTeamId",
			"TournamentMatchGameResult.stageId",
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.source",
			"TournamentMatchGameResult.createdAt",
			"TournamentMatchGameResult.ko",
		]),
	defaultSort: [["TournamentMatchGameResult.number", "asc"]],
	vocabulary: () => ({
		/** Who played the game for which team. */
		withParticipants: () =>
			refine("TournamentMatchGameResult", (qb) =>
				qb.select((eb) =>
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
				),
			),
	}),
});

export type GameResult = QueryRow<ReturnType<typeof gameResults>>;

/** Candidate times on league sets' scheduling boards, earliest first. */
export const scheduleProposals = defineQuery({
	root: "TournamentMatchScheduleProposal",
	select: (qb) =>
		qb.select([
			"TournamentMatchScheduleProposal.id",
			"TournamentMatchScheduleProposal.tournamentTeamId",
			"TournamentMatchScheduleProposal.proposedAt",
		]),
	defaultSort: [
		["TournamentMatchScheduleProposal.proposedAt", "asc"],
		["TournamentMatchScheduleProposal.id", "asc"],
	],
});

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
			// nullable in the DB, but always a number for new tournaments
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
			// participants are fetched flat below: nesting made SQLite build and re-parse a JSON document per game
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResult")
					.select([
						"TournamentMatchGameResult.id",
						"TournamentMatchGameResult.stageId",
						"TournamentMatchGameResult.mode",
						"TournamentMatchGameResult.winnerTeamId",
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
		// not strictly accurate, ordering by the tournament structure would be an improvement
		.orderBy("TournamentMatch.id", "asc")
		.execute();

	const participantsByGameResultId =
		await findFinishedMatchParticipantsByTournamentId(tournamentId);

	return rows.map((row) => {
		const opponentOne: AllMatchResultOpponent = {
			id: row.opponentOneId,
			score: row.opponentOneScore,
			droppedOut: row.opponentOneDroppedOut,
			activeRosterUserIds: row.opponentOneActiveRoster,
			memberUserIds: row.opponentOneMembers.map((member) => member.userId),
		};
		const opponentTwo: AllMatchResultOpponent = {
			id: row.opponentTwoId,
			score: row.opponentTwoScore,
			droppedOut: row.opponentTwoDroppedOut,
			activeRosterUserIds: row.opponentTwoActiveRoster,
			memberUserIds: row.opponentTwoMembers.map((member) => member.userId),
		};

		invariant(row.winnerSide, "Match has no winner");

		return {
			opponentOne,
			opponentTwo,
			winnerSide: row.winnerSide,
			roundMaps: row.roundMaps,
			maps: row.maps.map(({ id, ...map }) => {
				const participants = participantsByGameResultId.get(id) ?? [];

				invariant(participants.length > 0, "No participants found");
				invariant(
					participants.every(
						(participant) => typeof participant.tournamentTeamId === "number",
					),
					"Some participants have no team id",
				);
				invariant(
					participants.every(
						(participant) =>
							participant.tournamentTeamId === row.opponentOneId ||
							participant.tournamentTeamId === row.opponentTwoId,
					),
					"Some participants have an invalid team id",
				);

				return { ...map, participants };
			}),
		};
	});
}

/** Participants of every game of the tournament's finished matches, keyed by game result id. */
async function findFinishedMatchParticipantsByTournamentId(
	tournamentId: number,
) {
	const rows = await db
		.selectFrom("TournamentMatchGameResultParticipant")
		.innerJoin(
			"TournamentMatchGameResult",
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResultParticipant.matchGameResultId",
		)
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
			"TournamentMatchGameResultParticipant.matchGameResultId",
			"TournamentMatchGameResultParticipant.tournamentTeamId",
			"TournamentMatchGameResultParticipant.userId",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.where("TournamentMatch.winnerSide", "is not", null)
		.execute();

	const result = new Map<
		number,
		AllMatchResult["maps"][number]["participants"]
	>();
	for (const { matchGameResultId, ...participant } of rows) {
		const participants = result.get(matchGameResultId);
		if (participants) {
			participants.push(participant);
		} else {
			result.set(matchGameResultId, [participant]);
		}
	}

	return result;
}

export async function findUserParticipationByTournamentId(
	tournamentId: number,
) {
	return db
		.with("playerMatches", (cte) =>
			cte
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
			"TournamentMatch.winnerSide",
			sql<Side>`iif(${opponentOneId} = ${tournamentTeamId}, 'opponent1', 'opponent2')`.as(
				"teamSide",
			),
			opponentOneScore.as("opponentOneScore"),
			opponentTwoScore.as("opponentTwoScore"),
			"otherTeam.name as otherTeamName",
			"otherTeam.id as otherTeamId",
			"TournamentRound.number as roundNumber",
			"TournamentRound.stageId",
			"TournamentRound.section",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResult")
					.select((gameEb) => [
						"TournamentMatchGameResult.mode",
						"TournamentMatchGameResult.stageId",
						"TournamentMatchGameResult.source",
						asBoolean(
							gameEb(
								"TournamentMatchGameResult.winnerTeamId",
								"=",
								tournamentTeamId,
							),
						).as("wasWinner"),
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
					.select((playerEb) => [...commonUserSelect(playerEb), "User.country"])
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
		.orderBy(
			sql`case "TournamentRound"."section" when 'winners' then 1 when 'losers' then 2 when 'finals' then 3 else 0 end`,
			"asc",
		)
		.orderBy("TournamentRound.number", "asc")
		.execute();
}

/** Undecided league sets of the users' teams agreed to be played inside the window, one row per member; the blocks their schedules show. */
export function findScheduledByUserIds({
	userIds,
	startsAt,
	endsAt,
}: {
	userIds: Array<number>;
	startsAt: number;
	endsAt: number;
}) {
	if (userIds.length === 0) return Promise.resolve([]);

	return scheduledMatchesQuery()
		.innerJoin(
			"TournamentTeamMember",
			"TournamentTeamMember.tournamentTeamId",
			"TournamentTeam.id",
		)
		.select(["TournamentTeamMember.userId", "CalendarEvent.name"])
		.where("TournamentTeamMember.userId", "in", userIds)
		.where("TournamentMatch.scheduledAt", ">=", startsAt)
		.where("TournamentMatch.scheduledAt", "<", endsAt)
		.execute();
}

/** Undecided league sets of the user's teams agreed to be played inside the window, for the sidebar's events. */
export function findScheduledByUserId({
	userId,
	startsAt,
	endsAt,
}: {
	userId: number;
	startsAt: number;
	endsAt: number;
}) {
	return scheduledMatchesQuery()
		.innerJoin(
			"TournamentTeamMember",
			"TournamentTeamMember.tournamentTeamId",
			"TournamentTeam.id",
		)
		.innerJoin("TournamentTeam as Opponent", (join) =>
			join.on((eb) =>
				eb.or([
					eb.and([
						eb(opponentOneId, "!=", eb.ref("TournamentTeam.id")),
						eb(opponentOneId, "=", eb.ref("Opponent.id")),
					]),
					eb.and([
						eb(opponentTwoId, "!=", eb.ref("TournamentTeam.id")),
						eb(opponentTwoId, "=", eb.ref("Opponent.id")),
					]),
				]),
			),
		)
		.select((eb) => [
			"CalendarEvent.name as tournamentName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			"TournamentTeam.name as ownTeamName",
			"Opponent.name as opponentTeamName",
		])
		.where("TournamentTeamMember.userId", "=", userId)
		.where("TournamentMatch.scheduledAt", ">=", startsAt)
		.where("TournamentMatch.scheduledAt", "<", endsAt)
		.orderBy("TournamentMatch.scheduledAt", "asc")
		.execute();
}

/** Sets the players who participated in a game result, replacing any existing ones. */
export async function setParticipants(
	args: {
		resultId: number;
		participants: Array<
			Pick<
				Tables["TournamentMatchGameResultParticipant"],
				"userId" | "tournamentTeamId"
			>
		>;
	},
	trx: Transaction<DB>,
) {
	await participantTable.delete({ matchGameResultId: args.resultId }, trx);

	await participantTable.insertMany(
		args.participants.map((participant) => ({
			...participant,
			matchGameResultId: args.resultId,
		})),
		trx,
	);
}

/** Puts the candidate times on the set's board; ones the team already has there are skipped. */
export function insertScheduleProposals({
	matchId,
	tournamentTeamId,
	authorId,
	proposedAts,
}: {
	matchId: number;
	tournamentTeamId: number;
	authorId: number;
	proposedAts: Array<number>;
}) {
	return db
		.insertInto("TournamentMatchScheduleProposal")
		.values(
			proposedAts.map((proposedAt) => ({
				matchId,
				tournamentTeamId,
				authorId,
				proposedAt,
			})),
		)
		.onConflict((oc) => oc.doNothing())
		.returning("id")
		.execute();
}

/** Makes `proposedAts` the team's candidates on the set's board: missing ones are added, ones not listed are taken off. Returns the added rows. */
export function replaceScheduleProposals({
	matchId,
	tournamentTeamId,
	authorId,
	proposedAts,
}: {
	matchId: number;
	tournamentTeamId: number;
	authorId: number;
	proposedAts: Array<number>;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentMatchScheduleProposal")
			.where("TournamentMatchScheduleProposal.matchId", "=", matchId)
			.where(
				"TournamentMatchScheduleProposal.tournamentTeamId",
				"=",
				tournamentTeamId,
			)
			.$if(proposedAts.length > 0, (qb) =>
				qb.where(
					"TournamentMatchScheduleProposal.proposedAt",
					"not in",
					proposedAts,
				),
			)
			.execute();

		if (proposedAts.length === 0) return [];

		return trx
			.insertInto("TournamentMatchScheduleProposal")
			.values(
				proposedAts.map((proposedAt) => ({
					matchId,
					tournamentTeamId,
					authorId,
					proposedAt,
				})),
			)
			.onConflict((oc) => oc.doNothing())
			.returning("id")
			.execute();
	});
}

/** Agrees the set's time, clearing the board; `setByOrganizer` closes the board for the teams. */
export function scheduleMatch({
	matchId,
	scheduledAt,
	setByOrganizer,
}: {
	matchId: number;
	scheduledAt: number;
	setByOrganizer: boolean;
}) {
	return db.transaction().execute(async (trx) => {
		await matchTable.updateById(
			matchId,
			{ scheduledAt, scheduleSetByOrganizer: setByOrganizer },
			trx,
		);

		await proposalTable.delete({ matchId }, trx);
	});
}

/** Undecided matches with an agreed time and one of their teams joined as `TournamentTeam`. */
function scheduledMatchesQuery() {
	return db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentStage.tournamentId",
		)
		.innerJoin("TournamentTeam", (join) =>
			join.on((eb) =>
				eb.or([
					eb(opponentOneId, "=", eb.ref("TournamentTeam.id")),
					eb(opponentTwoId, "=", eb.ref("TournamentTeam.id")),
				]),
			),
		)
		.select([
			"TournamentMatch.id",
			"TournamentMatch.scheduledAt",
			"TournamentStage.tournamentId",
			"TournamentTeam.id as tournamentTeamId",
		])
		.where("TournamentMatch.winnerSide", "is", null)
		.$narrowType<{ scheduledAt: NotNull }>();
}

/** The match's stage. Correlates on `"TournamentMatch"."stageId"`. */
function stageOf(eb: ExpressionBuilder<DB, "TournamentMatch">) {
	return eb
		.selectFrom("TournamentStage")
		.whereRef("TournamentStage.id", "=", "TournamentMatch.stageId");
}

/** The match's round. Correlates on `"TournamentMatch"."roundId"`. */
function roundOf(eb: ExpressionBuilder<DB, "TournamentMatch">) {
	return eb
		.selectFrom("TournamentRound")
		.whereRef("TournamentRound.id", "=", "TournamentMatch.roundId");
}
