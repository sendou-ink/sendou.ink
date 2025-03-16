import { sql } from "~/db/sql";
import type { Group, GroupMember } from "~/db/types";
import { parseDBJsonArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  select
    "Group"."id",
    "Group"."status",
    json_group_array(
      json_object(
        'id', "User"."id",
        'username', "User"."username",
        'role', "GroupMember"."role"
      )
    ) as "members"
  from
    "Group"
  left join "GroupMember" on "GroupMember"."groupId" = "Group"."id"
  left join "User" on "User"."id" = "GroupMember"."userId"
  where
    "Group"."inviteCode" = @inviteCode
      and "Group"."status" != 'INACTIVE'
  group by "Group"."id"
`);

export function findGroupByInviteCode(inviteCode: string): {
	id: number;
	status: Group["status"];
	members: { id: number; username: string; role: GroupMember["role"] }[];
} | null {
	const row = stm.get({ inviteCode }) as any;
	if (!row) return null;

	return {
		id: row.id,
		status: row.status,
		members: parseDBJsonArray(row.members),
	};
}
