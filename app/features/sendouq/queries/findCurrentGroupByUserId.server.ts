import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import invariant from "~/utils/invariant";

const stm = sql.prepare(/* sql */ `
  select
    "Group"."id",
    "Group"."status",
    "Group"."latestActionAt",
    "Group"."chatCode",
    "GroupMatch"."id" as "matchId",
    "GroupMember"."role"
  from
    "Group"
  left join "GroupMember" on "GroupMember"."groupId" = "Group"."id"
  left join "GroupMatch" on "GroupMatch"."alphaGroupId" = "Group"."id"
    or "GroupMatch"."bravoGroupId" = "Group"."id"
  where
    "Group"."status" != 'INACTIVE'
    and "GroupMember"."userId" = @userId
`);

type ActiveGroup = Pick<
	Tables["Group"],
	"id" | "status" | "latestActionAt" | "chatCode"
> & {
	matchId?: number;
	role: Tables["GroupMember"]["role"];
};

export function findCurrentGroupByUserId(
	userId: number,
): ActiveGroup | undefined {
	const groups = stm.all({ userId }) as any;

	invariant(groups.length <= 1, "User can't be in more than one group");

	return groups[0];
}
