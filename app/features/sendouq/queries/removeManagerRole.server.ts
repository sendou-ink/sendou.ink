import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  update "GroupMember"
  set "role" = 'REGULAR'
  where "userId" = @userId
    and "groupId" = @groupId
`);

export function removeManagerRole({
	userId,
	groupId,
}: {
	userId: number;
	groupId: number;
}) {
	stm.run({ userId, groupId });
}
