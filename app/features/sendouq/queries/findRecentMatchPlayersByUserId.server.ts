import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql*/ `
  with "MostRecentGroupMatch" as (
    select 
      "GroupMatch".*
    from "GroupMember"
      left join "Group" on "Group"."id" = "GroupMember"."groupId"
      inner join "GroupMatch" on "GroupMatch"."alphaGroupId" = "Group"."id"
        or "GroupMatch"."bravoGroupId" = "Group"."id"
    where
      "GroupMember"."userId" = @userId
    order by "GroupMatch"."createdAt" desc
    limit 1
  )
  select
    "GroupMember"."groupId",
    "GroupMember"."userId"
  from "MostRecentGroupMatch"
  left join "Group" on "Group"."id" = "MostRecentGroupMatch"."alphaGroupId"
    or "Group"."id" = "MostRecentGroupMatch"."bravoGroupId"
  left join "GroupMember" on "GroupMember"."groupId" = "Group"."id"
  where
    "MostRecentGroupMatch"."createdAt" > unixepoch() - 60 * 60 * 2
`);

export type RecentMatchPlayer = Pick<
	Tables["GroupMember"],
	"groupId" | "userId"
>;

export function findRecentMatchPlayersByUserId(userId: number) {
	return stm.all({ userId }) as Array<RecentMatchPlayer>;
}
