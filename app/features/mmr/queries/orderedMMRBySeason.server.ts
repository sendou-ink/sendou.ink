import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const userStm = sql.prepare(/* sql */ `
  select
    "Skill"."ordinal",
    "Skill"."matchesCount",
    "Skill"."userId"
  from
    "Skill"
  inner join (
    select "userId", max("id") as "maxId"
    from "Skill"
    where "Skill"."season" = @season
    group by "userId"
  ) "Latest" on "Skill"."userId" = "Latest"."userId" and "Skill"."id" = "Latest"."maxId"
  where
    "Skill"."season" = @season
    and "Skill"."userId" is not null
  order by
    "Skill"."ordinal" desc
`);

export function orderedUserMMRBySeason(season: number) {
	return userStm.all({ season }) as Array<
		Pick<Tables["Skill"], "ordinal" | "matchesCount" | "userId">
	>;
}
