import { nanoid } from "nanoid";
import { sql } from "~/db/sql";
import type { LogInLink } from "~/db/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";

const stm = sql.prepare(/* sql */ `
  insert into "LogInLink" (
    "userId",
    "expiresAt",
    "code"
  ) values (
    @userId,
    @expiresAt,
    @code
  ) returning *
`);

// 10 minutes
const LOG_IN_LINK_VALID_FOR = 10 * 60 * 1000;
const LOG_IN_LINK_LENGTH = 12;

export function createLogInLink(userId: number) {
	return stm.get({
		userId,
		expiresAt: dateToDatabaseTimestamp(
			new Date(Date.now() + LOG_IN_LINK_VALID_FOR),
		),
		code: nanoid(LOG_IN_LINK_LENGTH),
	}) as LogInLink;
}
