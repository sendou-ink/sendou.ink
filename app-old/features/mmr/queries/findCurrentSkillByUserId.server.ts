import { sql } from "~/db/sql";
import type { Skill } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select
    "mu",
    "sigma",
    "matchesCount"
  from
    "Skill"
  where
    "id" = (
      select max("id")
        from "Skill"
      where "userId" = @userId
        and "season" = @season
      group by "userId"
    )
`);

export function findCurrentSkillByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return stm.get({ userId, season }) as Pick<
		Skill,
		"mu" | "sigma" | "matchesCount"
	> | null;
}
