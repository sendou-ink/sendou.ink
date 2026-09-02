import { sql, type Transaction } from "kysely";
import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { latestSkillPerSeason } from "~/utils/kysely.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";
import type { SkillTeamIdentifier } from "./mmr-utils";

export type CurrentSkill = Pick<
	Tables["Skill"],
	"mu" | "sigma" | "matchesCount"
>;

/** Season's latest skill of each user, keyed by user id; users without one are absent. */
export async function findCurrentUserSkills({
	season,
	userIds,
}: {
	season: number;
	userIds: Array<number>;
}) {
	if (userIds.length === 0) return new Map<number, CurrentSkill>();

	const rows = await db
		.selectFrom("Skill")
		.select(["mu", "sigma", "matchesCount", "userId"])
		.where("Skill.id", "in", latestSkillIdsOfSeason(season, "userId", userIds))
		.execute();

	return new Map<number, CurrentSkill>(
		rows.map((row) => [row.userId as number, row]),
	);
}

/** Season's latest skill of each team, keyed by identifier; teams without one are absent. */
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
		.selectFrom("Skill")
		.select(["mu", "sigma", "matchesCount", "identifier"])
		.where(
			"Skill.id",
			"in",
			latestSkillIdsOfSeason(season, "identifier", identifiers),
		)
		.execute();

	return new Map<SkillTeamIdentifier, CurrentSkill>(
		rows.map((row) => [row.identifier as SkillTeamIdentifier, row]),
	);
}

/** Ordinals of the season's latest skill of every user who has one, best first. */
export async function findOrderedUserOrdinalsBySeason(season: number) {
	return db
		.selectFrom(latestSkillPerSeason({ season, by: "userId" }).as("latest"))
		.select(["ordinal", "matchesCount", "userId"])
		.orderBy("ordinal", "desc")
		.execute();
}

/** Whether the season has any Skill rows. */
export async function existsBySeason(season: number) {
	const row = await db
		.selectFrom("Skill")
		.select("Skill.id")
		.where("Skill.season", "=", season)
		.limit(1)
		.executeTakeFirst();

	return Boolean(row);
}

/** Seeding skills of the users for one seeding type, keyed by user id; users without one are absent. */
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

/** Adds a user's starting skill of a season. */
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

/** Days (`yyyy-MM-dd`) of the season the user played a set on, with whether it was SendouQ, tournaments or both. */
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

/** Ids of the season's latest Skill row per user or team. A grouped `max(id)` is an index range per value; a `row_number()` window would materialize and sort every row first. */
function latestSkillIdsOfSeason(
	season: number,
	by: "userId" | "identifier",
	values: Array<number> | Array<SkillTeamIdentifier>,
) {
	return db
		.selectFrom("Skill")
		.select(({ fn }) => fn.max("Skill.id").as("latestId"))
		.where("Skill.season", "=", season)
		.where((eb) => eb(`Skill.${by}`, "in", values))
		.groupBy(`Skill.${by}`);
}

/** User's Skill rows of a season from played sets, grouped by day (`yyyy-MM-dd`) ascending; callers select what to aggregate per day. */
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
