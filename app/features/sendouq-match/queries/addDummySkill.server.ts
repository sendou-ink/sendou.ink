import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  insert into "Skill" ("groupMatchId", "identifier", "mu", "season", "sigma", "ordinal", "userId", "matchesCount")
    values (
      @groupMatchId, 
      null,
      -1, 
      -1, 
      -1, 
      -1,
      null,
      0
    )
`);

/** Adds a placeholder skill that makes the match locked */
export function addDummySkill(groupMatchId: number) {
	stm.run({ groupMatchId });
}
