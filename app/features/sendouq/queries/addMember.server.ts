import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  insert into "GroupMember" (
    "groupId",
    "userId",
    "role"
  ) values (
    @groupId,
    @userId,
    @role
  )
`);

export function addMember({
	groupId,
	userId,
	role = "REGULAR",
}: {
	groupId: number;
	userId: number;
	role?: Tables["GroupMember"]["role"];
}) {
	stm.run({ groupId, userId, role });
}
