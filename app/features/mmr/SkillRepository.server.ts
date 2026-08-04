import { sql, type Transaction } from "kysely";
import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";
import type { SkillTeamIdentifier } from "./mmr-utils";

export type CurrentSkill = Pick<
	Tables["Skill"],
	"mu" | "sigma" | "matchesCount"
>;

/**
 * Season's latest skill of each given user, keyed by user id. Users without a skill
 * row that season are absent from the map.
 */
export async function findCurrentUserSkills({
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
export async function findCurrentTeamSkills({
	season,
	identifiers,
}: {
	season: number;
	identifiers: Array<SkillTeamIdentifier>;
}) {
	if (identifiers.length === 0)
		return new Map<SkillTeamIdentifier, CurrentSkill>();

	const rows = await db
		.selectFrom(
			latestSkillsOfSeason(season, "identifier")
				.where("identifier", "in", identifiers)
				.as("latest"),
		)
		.select(["mu", "sigma", "matchesCount", "identifier"])
		.where("rn", "=", 1)
		.execute();

	return new Map<SkillTeamIdentifier, CurrentSkill>(
		rows.map((row) => [row.identifier as SkillTeamIdentifier, row]),
	);
}

/**
 * Ordinals of the season's latest skill of every user who has one, best first.
 */
export async function findOrderedUserOrdinalsBySeason(season: number) {
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
 * Whether the season has any Skill rows.
 */
export async function existsBySeason(season: number) {
	const row = await db
		.selectFrom("Skill")
		.select("Skill.id")
		.where("Skill.season", "=", season)
		.limit(1)
		.executeTakeFirst();

	return Boolean(row);
}

/**
 * Seeding skills of the given users for one seeding type, keyed by user id. Users without
 * a seeding skill of that type are absent from the map.
 */
export async function findSeedingSkills({
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

/**
 * Adds a user's starting skill of a season.
 */
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

	return executor
		.insertInto("Skill")
		.values({
			mu,
			sigma,
			season,
			ordinal: ordinal({ mu, sigma }),
			userId,
			matchesCount: 0,
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

export async function findSeasonProgressionByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return seasonSkillsByDayQuery({ userId, season })
		.select(({ fn }) => fn.max("Skill.ordinal").as("ordinal"))
		.where("Skill.matchesCount", ">=", MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.execute();
}

/**
 * Days of the season the user played at least one set on, with whether they
 * played SendouQ, tournaments or both that day. Dates in `yyyy-MM-dd` format.
 */
export async function findSeasonActiveDaysByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<Array<{ date: string; activity: "sq" | "tournament" | "both" }>> {
	const rows = await seasonSkillsByDayQuery({ userId, season })
		.select([
			// raw max over a null check: did any of the day's Skill rows come from this source?
			sql<number>`max("Skill"."groupMatchId" is not null)`.as("playedSq"),
			sql<number>`max("Skill"."tournamentId" is not null)`.as(
				"playedTournament",
			),
		])
		.execute();

	return rows.map((row) => ({
		date: row.date,
		activity:
			row.playedSq && row.playedTournament
				? ("both" as const)
				: row.playedSq
					? ("sq" as const)
					: ("tournament" as const),
	}));
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

/**
 * User's Skill rows of a season that came from a set played, grouped by the day
 * it was played on (`yyyy-MM-dd`) in ascending order. Callers select what they
 * want aggregated per day.
 */
function seasonSkillsByDayQuery({
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
		.select(
			sql<string>`date(coalesce("Skill"."createdAt", "GroupMatch"."createdAt", "CalendarEventDate"."startsAt"), 'unixepoch')`.as(
				"date",
			),
		)
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season)
		.where(({ or, eb }) =>
			or([
				eb("GroupMatch.id", "is not", null),
				eb("Tournament.id", "is not", null),
			]),
		)
		.groupBy("date")
		.orderBy("date", "asc");
}
