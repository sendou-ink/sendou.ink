import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  update "Group"
    set "status" = 'ACTIVE' 
  where "id" = @groupId
`);

export function setGroupAsActive(groupId: Tables["Group"]["id"]) {
	stm.run({ groupId });
}
