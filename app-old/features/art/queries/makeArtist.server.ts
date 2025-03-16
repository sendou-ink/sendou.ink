import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  update "User"
    set "isArtist" = 1
    where "id" = @userId
`);

export function makeArtist(userId: number) {
	stm.run({ userId });
}
