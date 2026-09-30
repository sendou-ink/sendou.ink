import { type Kysely, sql } from "kysely";

/**
 * Retires `GroupMatch.memento`, 11.5% of the database, by moving the tiers a match's page
 * shows onto the groups and members they describe. Everything else it held is either dead
 * (`mapPreferences`, `modePreferences`), derivable from the season's `Skill` rows (the SP
 * differences), or readable live from the pools it snapshotted, which only an unfinished
 * match's map votes ever needed.
 *
 * Backfilling the tiers keeps every historical match showing what was actually held at the
 * time, which recomputing could not: tier thresholds are percentiles of the season's live
 * distribution and shift as the season goes on.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("Group")
			.addColumn("tierName", "text")
			.execute();

		await trx.schema
			.alterTable("Group")
			.addColumn("tierIsPlus", "integer", (col) =>
				col.notNull().defaultTo(sql`0`),
			)
			.execute();

		await trx.schema
			.alterTable("GroupMember")
			.addColumn("tierName", "text")
			.execute();

		await trx.schema
			.alterTable("GroupMember")
			.addColumn("tierIsPlus", "integer", (col) =>
				col.notNull().defaultTo(sql`0`),
			)
			.execute();

		await sql`
			update "Group" as g
			set "tierName" = t."tierName",
				"tierIsPlus" = t."tierIsPlus"
			from (
				select
					cast(je."key" as integer) as "groupId",
					je."value" ->> '$.tier.name' as "tierName",
					coalesce(je."value" ->> '$.tier.isPlus', 0) as "tierIsPlus"
				from "GroupMatch" m, json_each(m."memento" -> '$.groups') je
				where m."memento" is not null
			) as t
			where g."id" = t."groupId" and t."tierName" is not null
		`.execute(trx);

		// the memento keys members by user id across both groups, so each row is matched
		// back to its own group through the match the memento belongs to
		await sql`
			update "GroupMember" as gm
			set "tierName" = t."tierName",
				"tierIsPlus" = t."tierIsPlus"
			from (
				select
					m."alphaGroupId",
					m."bravoGroupId",
					cast(je."key" as integer) as "userId",
					iif(
						je."value" ->> '$.skill' = 'CALCULATING',
						'CALCULATING',
						je."value" ->> '$.skill.tier.name'
					) as "tierName",
					coalesce(je."value" ->> '$.skill.tier.isPlus', 0) as "tierIsPlus"
				from "GroupMatch" m, json_each(m."memento" -> '$.users') je
				where m."memento" is not null
			) as t
			where gm."userId" = t."userId"
				and gm."groupId" in (t."alphaGroupId", t."bravoGroupId")
				and t."tierName" is not null
		`.execute(trx);

		await trx.schema.alterTable("GroupMatch").dropColumn("memento").execute();
	});
}
