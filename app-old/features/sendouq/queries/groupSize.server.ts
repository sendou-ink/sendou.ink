import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  select
    count(*) as "count"
  from
    "GroupMember"
  where
    "GroupMember"."groupId" = @groupId
`);

export function groupSize(groupId: number) {
	return (stm.get({ groupId }) as any).count as number;
}
