import { type Kysely, sql } from "kysely";

/**
 * The profile page is widget based for everyone from now on, and bio & sensitivity
 * live in widget settings rather than in their own `User` columns. Users who have
 * either of those saved get the default layout written out with the values carried
 * over, so their profile keeps showing what it showed before.
 *
 * Users without a bio or sensitivity keep no rows of their own: they render the
 * default layout, which stays in sync as the default changes. Users who have already
 * picked their widgets are left alone.
 *
 * Once the values are copied over, the columns they came from go, as does the
 * preference that used to gate the widget profile.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await sql`
		with "eligible" as (
			select "User"."id", "User"."bio", "User"."motionSens", "User"."stickSens"
			from "User"
			where (
					("User"."bio" is not null and "User"."bio" != '')
					or "User"."motionSens" is not null
					or "User"."stickSens" is not null
				)
				and not exists (
					select 1 from "UserWidget" where "UserWidget"."userId" = "User"."id"
				)
		),
		"presetWidget" as (
			select 0 as "index", json_object('id', 'weapon-pool') as "widget"
			union all
			select 1, json_object('id', 'x-rank-peaks', 'settings', json_object('division', 'both'))
			union all
			select 2, json_object('id', 'trophies-owned')
			union all
			select 3, json_object('id', 'badges-owned')
			union all
			select 5, json_object('id', 'teams')
			union all
			select 6, json_object('id', 'social-links')
			union all
			select 8, json_object('id', 'join-date')
		)
		insert into "UserWidget" ("userId", "index", "widget")
		select "eligible"."id", "presetWidget"."index", "presetWidget"."widget"
		from "eligible", "presetWidget"
		union all
		select
			"eligible"."id",
			4,
			json_object('id', 'bio', 'settings', json_object('bio', coalesce("eligible"."bio", '')))
		from "eligible"
		union all
		select
			"eligible"."id",
			7,
			json_object(
				'id', 'sens',
				'settings', json_object(
					'controller', 's2-pro-con',
					'motionSens', "eligible"."motionSens",
					'stickSens', "eligible"."stickSens"
				)
			)
		from "eligible"
	`.execute(db);

	await sql`
		update "User"
		set "preferences" = json_remove("preferences", '$.newProfileEnabled')
		where json_extract("preferences", '$.newProfileEnabled') is not null
	`.execute(db);

	for (const column of ["bio", "motionSens", "stickSens"]) {
		await db.schema.alterTable("User").dropColumn(column).execute();
	}
}
