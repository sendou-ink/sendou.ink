import { sql, type Transaction } from "kysely";
import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";

export type CurrentSkill = Pick<
	Tables["Skill"],
	"mu" | "sigma" | "matchesCount"
>;

/**
 * Season's latest skill of each given user, keyed by user id. Users without a skill
 * row that season are absent from the map.
 */
export async function currentUserSkills({
	season,
	userIds,
}: {
	season: number;
	userIds: Array<number>;
}) {
	if (userIds.length === 0) return new Map<number, CurrentSkill>();

	const rows = await db
		.selectFrom(
			latestSkillsOfSeason(season, "userId")
				.where("userId", "in", userIds)
				.as("latest"),
		)
		.select(["mu", "sigma", "matchesCount", "userId"])
		.where("rn", "=", 1)
		.execute();

	return new Map<number, CurrentSkill>(
		rows.map((row) => [row.userId as number, row]),
	);
}

/**
 * Season's latest skill of each given team, keyed by team identifier. Teams without a
 * skill row that season are absent from the map.
 */
export async function currentTeamSkills({
	season,
	identifiers,
}: {
	season: number;
	identifiers: Array<string>;
}) {
	if (identifiers.length === 0) return new Map<string, CurrentSkill>();

	const rows = await db
		.selectFrom(
			latestSkillsOfSeason(season, "identifier")
				.where("identifier", "in", identifiers)
				.as("latest"),
		)
		.select(["mu", "sigma", "matchesCount", "identifier"])
		.where("rn", "=", 1)
		.execute();

	return new Map<string, CurrentSkill>(
		rows.map((row) => [row.identifier as string, row]),
	);
}

/**
 * Ordinals of the season's latest skill of every user who has one, best first.
 */
export async function orderedUserOrdinalsBySeason(season: number) {
	// The latest row per user is picked via SQLite's bare column rule: with a `max()`
	// aggregate the other selected columns come from the row that produced the max.
	// A self-join against a `max(id)` subquery is avoided because it lets the planner
	// pick a nested-loop plan when it misjudges the season's row count (e.g. a freshly
	// started season whose stats are dwarfed by older seasons), which made this query
	// take ~12s. This form is plan-stable regardless of stats: a single grouped scan of
	// the `skill_season_user_id_leaderboard` covering index, no temp b-tree per user.
	return db
		.selectFrom(
			db
				.selectFrom("Skill")
				.select((eb) => [
					"ordinal",
					"matchesCount",
					"userId",
					eb.fn.max("id").as("latestId"),
				])
				.where("season", "=", season)
				.where("userId", "is not", null)
				.groupBy("userId")
				.as("latest"),
		)
		.select(["ordinal", "matchesCount", "userId"])
		.orderBy("ordinal", "desc")
		.execute();
}

/**
 * Seeding skills of the given users for one seeding type, keyed by user id. Users without
 * a seeding skill of that type are absent from the map.
 */
export async function seedingSkills({
	type,
	userIds,
}: {
	type: Tables["SeedingSkill"]["type"];
	userIds: Array<number>;
}) {
	type SeedingSkill = Pick<Tables["SeedingSkill"], "mu" | "sigma">;

	if (userIds.length === 0) return new Map<number, SeedingSkill>();

	const rows = await db
		.selectFrom("SeedingSkill")
		.select(["mu", "sigma", "userId"])
		.where("type", "=", type)
		.where("userId", "in", userIds)
		.execute();

	return new Map<number, SeedingSkill>(rows.map((row) => [row.userId, row]));
}

export async function addInitialSkill(
	{
		mu,
		sigma,
		season,
		userId,
	}: {
		mu: number;
		sigma: number;
		season: number;
		userId: number;
	},
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	await executor
		.insertInto("Skill")
		.values({
			mu,
			sigma,
			season,
			ordinal: ordinal({ mu, sigma }),
			userId,
			matchesCount: 0,
		})
		.execute();
}

export async function seasonProgressionByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return db
		.selectFrom("Skill")
		.leftJoin("GroupMatch", "GroupMatch.id", "Skill.groupMatchId")
		.leftJoin("Tournament", "Tournament.id", "Skill.tournamentId")
		.leftJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.leftJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select(({ fn }) => [
			fn.max("Skill.ordinal").as("ordinal"),
			sql<string>`date(coalesce("Skill"."createdAt", "GroupMatch"."createdAt", "CalendarEventDate"."startTime"), 'unixepoch')`.as(
				"date",
			),
		])
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season)
		.where("Skill.matchesCount", ">=", MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.where(({ or, eb }) =>
			or([
				eb("GroupMatch.id", "is not", null),
				eb("Tournament.id", "is not", null),
			]),
		)
		.groupBy("date")
		.orderBy("date", "asc")
		.execute();
}

/**
 * Season's Skill rows tagged with a `rn` of 1 for the latest row of each partition.
 * Callers narrow the partitions before selecting, and keep only `rn = 1`.
 */
function latestSkillsOfSeason(
	season: number,
	partitionBy: "userId" | "identifier",
) {
	return db
		.selectFrom("Skill")
		.select((eb) => [
			"mu",
			"sigma",
			"matchesCount",
			"userId",
			"identifier",
			eb.fn
				.agg<number>("row_number")
				.over((ob) => ob.partitionBy(partitionBy).orderBy("id", "desc"))
				.as("rn"),
		])
		.where("season", "=", season);
}
