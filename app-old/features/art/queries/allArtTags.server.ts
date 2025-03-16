import { sql } from "~/db/sql";
import type { ArtTag } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select
    "id",
    "name"
  from
    "ArtTag"
`);

export function allArtTags(): Array<Pick<ArtTag, "id" | "name">> {
	return stm.all() as any;
}
