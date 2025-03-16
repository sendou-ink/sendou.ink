import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  select
    "GroupLike"."likerGroupId",
    "GroupLike"."targetGroupId",
    "GroupLike"."isRechallenge"
  from
    "GroupLike"
  where
    "GroupLike"."likerGroupId" = @groupId
    or "GroupLike"."targetGroupId" = @groupId
  order by
    "GroupLike"."createdAt" desc
`);

export function findLikes(
	groupId: number,
): Pick<
	Tables["GroupLike"],
	"likerGroupId" | "targetGroupId" | "isRechallenge"
>[] {
	return stm.all({ groupId }) as any;
}
