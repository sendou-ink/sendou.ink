import { type Kysely, sql } from "kysely";

/**
 * Clears the custom URLs that predate the `/^[a-zA-Z0-9-_]+$/` rule the profile form
 * enforces today, leaving those users linked by their Discord id instead.
 *
 * They are all from the pre-Kysely era and cannot be created any more, but they are not
 * harmless leftovers:
 * - a value containing `?` truncates the link at that character, so `/u/leo?????` is
 *   requested as `/u/leo` — a 404, or worse, a different user's profile.
 * - the profile form prefills the field with the stored value, so these users cannot
 *   save any profile change at all without first picking a new custom URL.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await sql`
		update "User"
		set "customUrl" = null
		where "customUrl" is not null
			and "customUrl" glob '*[^a-zA-Z0-9_-]*'
	`.execute(db);
}
