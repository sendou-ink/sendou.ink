import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/*sql */ `
  select
    "User"."id" as "userId",
    "User"."banned",
    "User"."bannedReason"
  from
    "User"
  where
    "User"."banned" != 0
`);

type BannedUserRow = Pick<Tables["User"], "banned" | "bannedReason"> & {
	userId: number;
};

export function allBannedUsers() {
	const rows = stm.all() as Array<BannedUserRow>;

	const result: Map<number, BannedUserRow> = new Map();

	for (const row of rows) {
		result.set(row.userId, row);
	}

	return result;
}
