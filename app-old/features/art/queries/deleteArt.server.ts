import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  delete from "Art"
    where "id" = @id
`);

export function deleteArt(id: number) {
	stm.run({ id });
}
