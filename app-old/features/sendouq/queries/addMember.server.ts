import { sql } from "~/db/sql";
import type { GroupMember } from "~/db/types";

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
	role?: GroupMember["role"];
}) {
	stm.run({ groupId, userId, role });
}
