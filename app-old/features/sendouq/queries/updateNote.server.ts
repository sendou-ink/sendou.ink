import { sql } from "~/db/sql";
import type { GroupMember } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  update "GroupMember"
    set "note" = @note
    where "groupId" = @groupId and "userId" = @userId
`);

export function updateNote(args: {
	note: GroupMember["note"];
	groupId: GroupMember["groupId"];
	userId: GroupMember["userId"];
}) {
	stm.run(args);
}
