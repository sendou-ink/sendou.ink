import { type Kysely, sql } from "kysely";

/**
 * Every video is added validated and none was ever linked to an event, so the `UnvalidatedVideo`
 * table and its filtering `Video` view collapse into one `Video` table without `validatedAt` and
 * `eventId`. The few never validated videos left over are duplicates of validated ones and get deleted.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so dropping the old table doesn't cascade
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await sql`
				delete from "VideoMatchPlayer"
				where "videoMatchId" in (
					select "VideoMatch"."id" from "VideoMatch"
					inner join "UnvalidatedVideo" on "UnvalidatedVideo"."id" = "VideoMatch"."videoId"
					where "UnvalidatedVideo"."validatedAt" is null
				)
			`.execute(trx);
			await sql`
				delete from "VideoMatch"
				where "videoId" in (
					select "id" from "UnvalidatedVideo" where "validatedAt" is null
				)
			`.execute(trx);
			await sql`delete from "UnvalidatedVideo" where "validatedAt" is null`.execute(
				trx,
			);

			await sql`drop view "Video"`.execute(trx);
			await sql`drop index "video_event_id"`.execute(trx);
			// renaming first points VideoMatch's foreign key at "Video"
			await sql`alter table "UnvalidatedVideo" rename to "Video"`.execute(trx);

			await sql`
				create table "Video_new" (
					"id" integer primary key autoincrement,
					"title" text not null,
					"type" text not null,
					"youtubeId" text not null,
					"youtubePublishedAt" integer not null,
					"submitterUserId" integer not null,
					foreign key ("submitterUserId") references "User" ("id") on delete restrict
				) strict
			`.execute(trx);
			await sql`
				insert into "Video_new" ("id", "title", "type", "youtubeId", "youtubePublishedAt", "submitterUserId")
				select "id", "title", "type", "youtubeId", "youtubePublishedAt", "submitterUserId" from "Video"
			`.execute(trx);
			await sql`drop table "Video"`.execute(trx);
			await sql`alter table "Video_new" rename to "Video"`.execute(trx);

			const violations = await sql`pragma foreign_key_check`.execute(trx);
			if (violations.rows.length > 0) {
				throw new Error(
					`foreign key check failed: ${JSON.stringify(violations.rows.slice(0, 5))}`,
				);
			}
		});
	} finally {
		await sql`pragma foreign_keys = on`.execute(db);
	}
}
