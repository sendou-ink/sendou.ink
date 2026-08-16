import { sql } from "kysely";
import { db } from "~/db/sql";

/**
 * Moves a user to a fixed id. Production permission logic keys off literal user
 * ids (`ADMIN_ID`, `STAFF_IDS`), so the users those refer to have to land on them
 * for the app to consider them an admin or staff at all.
 *
 * Throws if the id is already taken, since taking it would mean deleting somebody
 * else's rows. Create the pinned users before any other.
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

	// the search index is kept in sync by triggers that don't watch `id`, so its
	// entry would keep pointing at the id the user just moved off of
	await sql`insert into "UserSearch"("UserSearch") values ('rebuild')`.execute(
		db,
	);

	return pinnedId;
}
