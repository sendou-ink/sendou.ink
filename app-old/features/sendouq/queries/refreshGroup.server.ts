import { sql } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";

const stm = sql.prepare(/* sql */ `
  update "Group"
    set 'latestActionAt' = @latestActionAt
    where "Group"."id" = @groupId
`);

export function refreshGroup(groupId: number) {
	stm.run({ latestActionAt: dateToDatabaseTimestamp(new Date()), groupId });
}
