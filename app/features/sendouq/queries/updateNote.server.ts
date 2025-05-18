import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  update "GroupMember"
    set "note" = @note
    where "groupId" = @groupId and "userId" = @userId
`);

export function updateNote(args: {
	note: Tables["GroupMember"]["note"];
	groupId: Tables["GroupMember"]["groupId"];
	userId: Tables["GroupMember"]["userId"];
}) {
	stm.run(args);
}
