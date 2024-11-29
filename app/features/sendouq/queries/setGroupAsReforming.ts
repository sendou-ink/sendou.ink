import { sql } from "~/db/sql";

const groupToReformingStm = sql.prepare(/* sql */ `
  update "Group"
  set "status" = 'REFORMING'
  where "id" = @groupId
`);

export function setGroupAsReforming(groupId: number) {
	groupToReformingStm.run({ groupId });
}
