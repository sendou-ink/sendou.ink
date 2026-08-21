import {
	type ExpressionBuilder,
	type NotNull,
	type SqlBool,
	sql,
	type Transaction,
} from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	commonUserJsonObject,
	jsonArrayFrom,
	latestSkillPerSeason,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";

const BEST_SET_OPPONENTS_WITH_SKILL_NEEDED = 2;
/** How many extra SendouQ sets to consider so that the roster deduplication still has enough left to return. */
const BEST_SET_CANDIDATES_PER_RESULT = 10;
const TOURNAMENT_FIELD_STRENGTH_PLACEMENT = 8;

export function upsertMapResults(
	results: Pick<
		Tables["MapResult"],
		"losses" | "wins" | "userId" | "mode" | "stageId" | "season"
	>[],
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	return executor
		.insertInto("MapResult")
		.values(results)
		.onConflict((oc) =>
			oc.columns(["userId", "stageId", "mode", "season"]).doUpdateSet((eb) => ({
				wins: eb("MapResult.wins", "+", eb.ref("excluded.wins")),
				losses: eb("MapResult.losses", "+", eb.ref("excluded.losses")),
			})),
		)
		.execute();
}

/** Aggregated map win/loss record for a user in a given season. */
export async function findSeasonMapWinrateByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<{ wins: number; losses: number }> {
	const row = await db
		.selectFrom("MapResult")
		.select(({ fn }) => [
			fn.sum<number>("wins").as("wins"),
			fn.sum<number>("losses").as("losses"),
		])
		.where("userId", "=", userId)
		.where("season", "=", season)
		.groupBy("userId")
		.executeTakeFirst();

	return row ?? { wins: 0, losses: 0 };
}

/** Aggregated set win/loss record for a user in a given season. */
export async function findSeasonSetWinrateByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<{ wins: number; losses: number }> {
	const row = await db
		.selectFrom("PlayerResult")
		.select([
			sql<number>`sum("setWins") / 4`.as("wins"),
			sql<number>`sum("setLosses") / 4`.as("losses"),
		])
		.where("ownerUserId", "=", userId)
		.where("season", "=", season)
		.where("type", "=", "ENEMY")
		.groupBy("ownerUserId")
		.executeTakeFirst();

	return row ?? { wins: 0, losses: 0 };
}

/** Per-stage per-mode win/loss breakdown for a user in a given season. */
export async function findSeasonStagesByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const rows = await db
		.selectFrom("MapResult")
		.select(["wins", "losses", "stageId", "mode"])
		.where("userId", "=", userId)
		.where("season", "=", season)
		.execute();

	return rows.reduce(
		(acc, cur) => {
			if (!acc[cur.stageId]) acc[cur.stageId] = {};

			acc[cur.stageId]![cur.mode] = {
				wins: cur.wins,
				losses: cur.losses,
			};

			return acc;
		},
		{} as Partial<
			Record<
				StageId,
				Partial<Record<ModeShort, { wins: number; losses: number }>>
			>
		>,
	);
}

/** Mates or enemies for a user in a given season, ordered by most maps played together. */
export async function findSeasonMatesEnemiesByUserId({
	userId,
	season,
	type,
}: {
	userId: number;
	season: number;
	type: Tables["PlayerResult"]["type"];
}) {
	return db
		.selectFrom("PlayerResult")
		.leftJoin("User", "User.id", "PlayerResult.otherUserId")
		.select((eb) => [
			"mapWins",
			"mapLosses",
			"setWins",
			"setLosses",
			commonUserJsonObject(eb).as("user"),
		])
		.where("ownerUserId", "=", userId)
		.where("season", "=", season)
		.where("type", "=", type)
		.orderBy(({ eb }) => eb("mapWins", "+", eb.ref("mapLosses")), "desc")
		.execute();
}

/**
 * Chronological (oldest first) scores of every set the user played in a given
 * season, both SendouQ matches and ranked tournaments.
 */
export async function findSeasonSetScoresByUserId(args: {
	userId: number;
	season: number;
}): Promise<Array<{ ownScore: number; opponentScore: number }>> {
	const [sqSets, tournamentSets] = await Promise.all([
		sqSetScoresQuery(args)
			.select("GroupMatch.createdAt as playedAt")
			.groupBy("GroupMatch.id")
			.execute(),
		db
			.selectFrom(tournamentSetsQuery(args).as("TournamentSet"))
			.select((eb) => [
				"TournamentSet.playedAt",
				tournamentSetGamesWonCount(eb, "own").as("ownScore"),
				tournamentSetGamesWonCount(eb, "opponent").as("opponentScore"),
			])
			.execute(),
	]);

	return [...sqSets, ...tournamentSets]
		.sort((a, b) => a.playedAt - b.playedAt)
		.map((set) => ({
			ownScore: set.ownScore,
			opponentScore: set.opponentScore,
		}));
}

/**
 * The user's won sets of a season ranked by the average opponent skill
 * (ordinal) at the time the set was played, best first. Covers both SendouQ
 * matches and ranked tournaments; tournament sets are skipped unless at least
 * two opponents have a calculated skill for that tournament. Only the best set
 * against any given opponent roster is included.
 */
export async function findSeasonBestSetsByUserId({
	userId,
	season,
	limit,
}: {
	userId: number;
	season: number;
	limit: number;
}) {
	const [sqSets, tournamentSets] = await Promise.all([
		db
			.selectFrom(
				sqSetScoresQuery({ userId, season })
					.select([
						"GroupMatch.id as groupMatchId",
						// raw iif: the opposing group is whichever side of the match the user's group is not
						sql<number>`iif("OwnMember"."groupId" = "GroupMatch"."alphaGroupId", "GroupMatch"."bravoGroupId", "GroupMatch"."alphaGroupId")`.as(
							"opponentGroupId",
						),
					])
					.groupBy("GroupMatch.id")
					.as("SqSet"),
			)
			.select((eb) => [
				"SqSet.ownScore",
				"SqSet.opponentScore",
				eb
					.selectFrom("Skill as OpponentSkill")
					.select(({ fn }) =>
						fn.avg<number>("OpponentSkill.ordinal").as("average"),
					)
					.whereRef("OpponentSkill.groupMatchId", "=", "SqSet.groupMatchId")
					.where((ieb) =>
						ieb(
							"OpponentSkill.userId",
							"in",
							ieb
								.selectFrom("GroupMember")
								.select("GroupMember.userId")
								.whereRef("GroupMember.groupId", "=", "SqSet.opponentGroupId"),
						),
					)
					.as("avgOpponentOrdinal"),
				jsonArrayFrom(
					eb
						.selectFrom("GroupMember")
						.innerJoin("User", "User.id", "GroupMember.userId")
						.select(["User.id", "User.username", "User.country"])
						.whereRef("GroupMember.groupId", "=", "SqSet.opponentGroupId")
						.orderBy("User.username", "asc"),
				).as("opponentPlayers"),
			])
			.whereRef("SqSet.ownScore", ">", "SqSet.opponentScore")
			.orderBy("avgOpponentOrdinal", "desc")
			.limit(limit * BEST_SET_CANDIDATES_PER_RESULT)
			.execute(),
		db
			.selectFrom(tournamentSetsQuery({ userId, season }).as("TournamentSet"))
			.innerJoin(
				"CalendarEvent",
				"CalendarEvent.tournamentId",
				"TournamentSet.tournamentId",
			)
			.select((eb) => {
				const opponentUserIds = eb
					.selectFrom(
						"TournamentMatchGameResultParticipant as OpponentParticipant",
					)
					.innerJoin(
						"TournamentMatchGameResult as OpponentGameResult",
						"OpponentGameResult.id",
						"OpponentParticipant.matchGameResultId",
					)
					.select("OpponentParticipant.userId")
					.distinct()
					.whereRef(
						"OpponentGameResult.matchId",
						"=",
						"TournamentSet.tournamentMatchId",
					)
					.whereRef(
						"OpponentParticipant.tournamentTeamId",
						"!=",
						"TournamentSet.ownTeamId",
					);

				return [
					tournamentSetGamesWonCount(eb, "own").as("ownScore"),
					tournamentSetGamesWonCount(eb, "opponent").as("opponentScore"),
					"CalendarEvent.name as tournamentName",
					eb
						.selectFrom("Skill as OpponentSkill")
						.select(({ fn }) =>
							fn.avg<number>("OpponentSkill.ordinal").as("average"),
						)
						.whereRef(
							"OpponentSkill.tournamentId",
							"=",
							"TournamentSet.tournamentId",
						)
						.where("OpponentSkill.userId", "in", opponentUserIds)
						.as("avgOpponentOrdinal"),
					eb
						.selectFrom("Skill as OpponentSkill")
						.select(({ fn }) => fn.countAll<number>().as("count"))
						.whereRef(
							"OpponentSkill.tournamentId",
							"=",
							"TournamentSet.tournamentId",
						)
						.where("OpponentSkill.userId", "in", opponentUserIds)
						.$asScalar()
						.$notNull()
						.as("opponentsWithSkillCount"),
					jsonArrayFrom(
						eb
							.selectFrom("User")
							.select(["User.id", "User.username", "User.country"])
							.where("User.id", "in", opponentUserIds)
							.orderBy("User.username", "asc"),
					).as("opponentPlayers"),
				];
			})
			.execute(),
	]);

	const sets = [
		...sqSets.flatMap((set) =>
			set.avgOpponentOrdinal === null
				? []
				: [
						{
							ownScore: set.ownScore,
							opponentScore: set.opponentScore,
							avgOpponentOrdinal: set.avgOpponentOrdinal,
							opponentPlayers: set.opponentPlayers,
							tournamentName: null,
						},
					],
		),
		...tournamentSets.flatMap((set) =>
			set.avgOpponentOrdinal === null ||
			set.ownScore <= set.opponentScore ||
			set.opponentsWithSkillCount < BEST_SET_OPPONENTS_WITH_SKILL_NEEDED
				? []
				: [
						{
							ownScore: set.ownScore,
							opponentScore: set.opponentScore,
							avgOpponentOrdinal: set.avgOpponentOrdinal,
							opponentPlayers: set.opponentPlayers,
							tournamentName: set.tournamentName,
						},
					],
		),
	].sort((a, b) => b.avgOpponentOrdinal - a.avgOpponentOrdinal);

	// keeps the best set played against each distinct set of opponents
	return R.uniqueBy(sets, (set) =>
		set.opponentPlayers
			.map((player) => player.id)
			.toSorted((a, b) => a - b)
			.join("-"),
	).slice(0, limit);
}

/**
 * The user's ranked tournament results of a season with the tournament's tier,
 * field size and the average end of season skill (ordinal) of its top 8 placing
 * players, for picking their best tournament run.
 */
export async function findSeasonTournamentRunsByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return db
		.selectFrom("Skill")
		.innerJoin("TournamentResult", (join) =>
			join
				.onRef("TournamentResult.tournamentId", "=", "Skill.tournamentId")
				.on("TournamentResult.userId", "=", userId),
		)
		.innerJoin("Tournament", "Tournament.id", "Skill.tournamentId")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentResult.tournamentTeamId",
		)
		.leftJoin("TournamentDivisionTier", (join) =>
			join
				.onRef(
					"TournamentDivisionTier.tournamentId",
					"=",
					"TournamentResult.tournamentId",
				)
				.on(
					sql<SqlBool>`"TournamentDivisionTier"."bracketIdx" = coalesce("TournamentTeam"."startingBracketIdx", 0)`,
				),
		)
		.select((eb) => [
			"TournamentResult.placement",
			"TournamentResult.participantCount as teamsCount",
			sql<
				Tables["Tournament"]["tier"]
			>`coalesce("TournamentDivisionTier"."tier", "Tournament"."tier")`.as(
				"tier",
			),
			"CalendarEvent.name",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			eb
				.selectFrom(
					latestSkillPerSeason({ season, by: "userId" })
						.where(
							"Skill.userId",
							"in",
							eb
								.selectFrom("TournamentResult as TopEightResult")
								.innerJoin(
									"TournamentTeam as TopEightTeam",
									"TopEightTeam.id",
									"TopEightResult.tournamentTeamId",
								)
								.select("TopEightResult.userId")
								.whereRef("TopEightResult.tournamentId", "=", "Tournament.id")
								.where(
									"TopEightResult.placement",
									"<=",
									TOURNAMENT_FIELD_STRENGTH_PLACEMENT,
								)
								.where(
									sql<SqlBool>`coalesce("TopEightTeam"."startingBracketIdx", 0) = coalesce("TournamentTeam"."startingBracketIdx", 0)`,
								),
						)
						.as("TopEightLatestSkill"),
				)
				.select(({ fn }) =>
					fn.avg<number>("TopEightLatestSkill.ordinal").as("average"),
				)
				.as("topEightAvgOrdinal"),
		])
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season)
		.execute();
}

export function upsertPlayerResults(
	results: Tables["PlayerResult"][],
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	return executor
		.insertInto("PlayerResult")
		.values(results)
		.onConflict((oc) =>
			oc
				.columns(["ownerUserId", "otherUserId", "type", "season"])
				.doUpdateSet((eb) => ({
					mapWins: eb("PlayerResult.mapWins", "+", eb.ref("excluded.mapWins")),
					mapLosses: eb(
						"PlayerResult.mapLosses",
						"+",
						eb.ref("excluded.mapLosses"),
					),
					setWins: eb("PlayerResult.setWins", "+", eb.ref("excluded.setWins")),
					setLosses: eb(
						"PlayerResult.setLosses",
						"+",
						eb.ref("excluded.setLosses"),
					),
				})),
		)
		.execute();
}

/**
 * SendouQ sets of the user's season with the map score summed per match.
 * Callers add their extra selects and finish with a `groupBy("GroupMatch.id")`.
 */
function sqSetScoresQuery({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return db
		.selectFrom("Skill")
		.innerJoin("GroupMatch", "GroupMatch.id", "Skill.groupMatchId")
		.innerJoin("GroupMember as OwnMember", (join) =>
			join
				.onRef("OwnMember.userId", "=", "Skill.userId")
				.on((eb) =>
					eb("OwnMember.groupId", "in", [
						eb.ref("GroupMatch.alphaGroupId"),
						eb.ref("GroupMatch.bravoGroupId"),
					]),
				),
		)
		.innerJoin("GroupMatchMap", "GroupMatchMap.matchId", "GroupMatch.id")
		.select([
			// raw sums of comparisons: counts the maps won by each side of the match
			sql<number>`sum("GroupMatchMap"."winnerGroupId" = "OwnMember"."groupId")`.as(
				"ownScore",
			),
			sql<number>`sum("GroupMatchMap"."winnerGroupId" is not null and "GroupMatchMap"."winnerGroupId" != "OwnMember"."groupId")`.as(
				"opponentScore",
			),
		])
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season);
}

interface SeasonTournamentSet {
	tournamentMatchId: number;
	tournamentId: number;
	ownTeamId: number;
	playedAt: number;
}

/**
 * One row per set the user played in the season's ranked tournaments (the
 * tournaments they have a `Skill` row for).
 */
function tournamentSetsQuery({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return db
		.selectFrom("TournamentMatchGameResultParticipant as Participant")
		.innerJoin(
			"TournamentMatchGameResult as GameResult",
			"GameResult.id",
			"Participant.matchGameResultId",
		)
		.innerJoin("TournamentMatch", "TournamentMatch.id", "GameResult.matchId")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select(({ fn }) => [
			"TournamentMatch.id as tournamentMatchId",
			"TournamentStage.tournamentId",
			"Participant.tournamentTeamId as ownTeamId",
			fn.max("GameResult.createdAt").as("playedAt"),
		])
		.where("Participant.userId", "=", userId)
		.where((eb) =>
			eb(
				"TournamentStage.tournamentId",
				"in",
				eb
					.selectFrom("Skill")
					.select("Skill.tournamentId")
					.where("Skill.userId", "=", userId)
					.where("Skill.season", "=", season)
					.where("Skill.tournamentId", "is not", null)
					.$narrowType<{ tournamentId: NotNull }>(),
			),
		)
		.groupBy("TournamentMatch.id");
}

/**
 * Games of a tournament set won by either side, counted over every game of the
 * set since the user may have sat out some of them. Correlates on a
 * `tournamentSetsQuery` aliased as `"TournamentSet"`.
 */
function tournamentSetGamesWonCount(
	eb: ExpressionBuilder<
		DB & { TournamentSet: SeasonTournamentSet },
		"TournamentSet"
	>,
	side: "own" | "opponent",
) {
	return eb
		.selectFrom("TournamentMatchGameResult as SetGame")
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.whereRef("SetGame.matchId", "=", "TournamentSet.tournamentMatchId")
		.whereRef(
			"SetGame.winnerTeamId",
			side === "own" ? "=" : "!=",
			"TournamentSet.ownTeamId",
		)
		.$asScalar()
		.$notNull();
}
