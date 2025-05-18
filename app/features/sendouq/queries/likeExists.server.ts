import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  select 1 from "GroupLike"
  where
    "GroupLike"."likerGroupId" = @likerGroupId
    and "GroupLike"."targetGroupId" = @targetGroupId
`);

export function likeExists({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	return Boolean(stm.get({ likerGroupId, targetGroupId }));
}
