import { add } from "date-fns";
import { nanoid } from "nanoid";
import { db } from "~/db/sql";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";

const LOG_IN_LINK_LENGTH = 12;
const LOG_IN_LINK_VALID_FOR_MINUTES = 10;

/** Creates a login link valid for `LOG_IN_LINK_VALID_FOR_MINUTES`. */
export function insert(userId: number) {
	return db
		.insertInto("LogInLink")
		.values({
			code: nanoid(LOG_IN_LINK_LENGTH),
			expiresAt: dateToDatabaseTimestamp(
				add(new Date(), { minutes: LOG_IN_LINK_VALID_FOR_MINUTES }),
			),
			userId,
		})
		.returningAll()
		.executeTakeFirstOrThrow();
}

/** Deletes a login link by its code. */
export function deleteByCode(code: string) {
	return db.deleteFrom("LogInLink").where("code", "=", code).execute();
}

/** Non-expired login link by code. */
export function findValidByCode(code: string) {
	return db
		.selectFrom("LogInLink")
		.select("userId")
		.where("code", "=", code)
		.where("expiresAt", ">", databaseTimestampNow())
		.executeTakeFirst();
}
