import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  insert into "GroupLike" ("likerGroupId", "targetGroupId")
    values (@likerGroupId, @targetGroupId)
    on conflict ("likerGroupId", "targetGroupId") do nothing
`);

export function addLike({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	stm.run({ likerGroupId, targetGroupId });
}
