import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  select 1
  from "GroupMatch"
  where
    "alphaGroupId" = @groupId
    or "bravoGroupId" = @groupId
`);

export function groupHasMatch(groupId: number) {
	return Boolean(stm.get({ groupId }));
}
