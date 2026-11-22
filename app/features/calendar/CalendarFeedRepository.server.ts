import { nanoid } from "nanoid";
import { db } from "~/db/sql";
import { actorId } from "~/features/auth/core/user.server";

/** Secret token of the logged in user's personal iCalendar feed URL, `undefined` if they haven't created one. */
export async function findOwnToken() {
	const row = await db
		.selectFrom("UserCalendarFeed")
		.select("UserCalendarFeed.token")
		.where("UserCalendarFeed.userId", "=", actorId())
		.executeTakeFirst();

	return row?.token;
}

/** Whose personal iCalendar feed the token opens, `undefined` for an unknown (or reset) token. */
export async function findUserIdByToken(token: string) {
	const row = await db
		.selectFrom("UserCalendarFeed")
		.select("UserCalendarFeed.userId")
		.where("UserCalendarFeed.token", "=", token)
		.executeTakeFirst();

	return row?.userId;
}

/** Gives the logged in user a new feed token, the URL with the old one stops working. */
export async function upsertOwnToken() {
	const token = nanoid();

	await db
		.insertInto("UserCalendarFeed")
		.values({ userId: actorId(), token })
		.onConflict((oc) => oc.column("userId").doUpdateSet({ token }))
		.execute();
}
