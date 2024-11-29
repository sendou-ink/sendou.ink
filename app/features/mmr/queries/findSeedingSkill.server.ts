import { sql } from "~/db/sql";
import type { Tables } from "../../../db/tables";

const stm = sql.prepare(/* sql */ `
  select
    "mu",
    "sigma"
  from
    "SeedingSkill"
  where
    "userId" = @userId
  and
    "type" = @type
`);

export function findSeedingSkill(args: {
	userId: number;
	type: Tables["SeedingSkill"]["type"];
}) {
	return stm.get(args) as Pick<Tables["SeedingSkill"], "mu" | "sigma"> | null;
}
