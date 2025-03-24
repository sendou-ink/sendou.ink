import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  select
    "id",
    "name"
  from
    "ArtTag"
`);

export function allArtTags(): Array<Pick<Tables["ArtTag"], "id" | "name">> {
	return stm.all() as any;
}
