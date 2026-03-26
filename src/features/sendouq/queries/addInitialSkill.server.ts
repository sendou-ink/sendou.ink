import { ordinal } from "openskill";
import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  insert into "Skill" ("mu", "season", "sigma", "ordinal", "userId", "matchesCount")
  values (
    @mu, 
    @season, 
    @sigma, 
    @ordinal,
    @userId,
    0
  )
`);

export function addInitialSkill({
	mu,
	sigma,
	season,
	userId,
}: {
	mu: number;
	sigma: number;
	season: number;
	userId: number;
}) {
	stm.run({
		mu,
		sigma,
		season,
		ordinal: ordinal({ mu, sigma }),
		userId,
	});
}
