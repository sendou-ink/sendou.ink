import { db } from "#lib/server/db/sql.ts";
import { latestSkillPerSeason } from "#lib/server/kysely.ts";

/** Every user's latest skill row of the season, ordered by ordinal descending. */
export async function findOrderedUserOrdinalsBySeason(season: number) {
	return db
		.selectFrom(latestSkillPerSeason({ season, by: "userId" }).as("latest"))
		.select(["ordinal", "matchesCount", "userId"])
		.orderBy("ordinal", "desc")
		.execute();
}
