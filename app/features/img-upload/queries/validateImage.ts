import { sql } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";

const stm = sql.prepare(/* sql */ `
  update "UnvalidatedUserSubmittedImage"
    set "validatedAt" = @validatedAt
  where "id" = @id
`);

export function validateImage(id: number) {
	stm.run({ validatedAt: dateToDatabaseTimestamp(new Date()), id });
}
