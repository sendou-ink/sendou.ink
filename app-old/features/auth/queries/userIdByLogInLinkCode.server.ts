import { sql } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";

const stm = sql.prepare(/* sql */ `
  select "userId"
  from "LogInLink"
  where "code" = @code
    and "expiresAt" > @now
`);

export function userIdByLogInLinkCode(code: string) {
	return (
		stm.get({
			code,
			now: dateToDatabaseTimestamp(new Date()),
		}) as any
	)?.userId as number | undefined;
}
