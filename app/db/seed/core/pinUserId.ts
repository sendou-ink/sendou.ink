import { sql } from "kysely";
import { db } from "~/db/sql";

/**
 * Moves a user to a fixed id, since permission logic keys off literal ids (`ADMIN_ID`, `STAFF_IDS`).
 * Throws if the id is taken, so create pinned users before any other.
 */
export async function pinUserId(userId: number, pinnedId: number) {
	if (userId === pinnedId) return pinnedId;

	const occupant = await db
		.selectFrom("User")
		.select("id")
		.where("id", "=", pinnedId)
		.executeTakeFirst();

	if (occupant) {
		throw new Error(
			`Can't pin user ${userId} to the id ${pinnedId}, it is already taken. Users with a pinned id have to be created before any other user.`,
		);
	}

	// raw because `User.id` is `GeneratedAlways`, which Kysely refuses to update
	await sql`update "User" set "id" = ${pinnedId} where "id" = ${userId}`.execute(
		db,
	);

	// the search index triggers don't watch `id`, so its entry would keep pointing at the old id
	await sql`insert into "UserSearch"("UserSearch") values ('rebuild')`.execute(
		db,
	);

	return pinnedId;
}
