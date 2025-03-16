import { sql } from "~/db/sql";
import type { Group } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  update "Group"
    set "status" = 'ACTIVE' 
  where "id" = @groupId
`);

export function setGroupAsActive(groupId: Group["id"]) {
	stm.run({ groupId });
}
