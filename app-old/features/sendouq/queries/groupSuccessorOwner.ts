import { sql } from "~/db/sql";
import type { GroupMember } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select 
    "GroupMember"."userId",
    "GroupMember"."role"
  from "GroupMember"
  where "GroupMember"."groupId" = @groupId
    and "GroupMember"."role" != 'OWNER'
  order by "GroupMember"."createdAt" asc
`);

export const groupSuccessorOwner = (groupId: number) => {
	const rows = stm.all({ groupId }) as Array<
		Pick<GroupMember, "role" | "userId">
	>;

	if (rows.length === 0) {
		return null;
	}

	const manager = rows.find((r) => r.role === "MANAGER");
	if (manager) return manager.userId;

	return rows[0].userId;
};
