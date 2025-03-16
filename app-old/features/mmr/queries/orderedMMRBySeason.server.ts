import { sql } from "~/db/sql";
import type { Skill } from "~/db/types";

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

const teamStm = sql.prepare(/* sql */ `
  select
    "Skill"."ordinal",
    "Skill"."matchesCount",
    "Skill"."identifier"
  from
    "Skill"
  inner join (
    select "identifier", max("id") as "maxId"
    from "Skill"
    where "Skill"."season" = @season
    group by "identifier"
  ) "Latest" on "Skill"."identifier" = "Latest"."identifier" and "Skill"."id" = "Latest"."maxId"
  where
    "Skill"."season" = @season
    and "Skill"."identifier" is not null
  order by
    "Skill"."ordinal" desc
`);

export function orderedMMRBySeason({
	season,
	type,
}: {
	season: number;
	type: "team" | "user";
}) {
	const stm = type === "team" ? teamStm : userStm;

	return stm.all({ season }) as Array<
		Pick<Skill, "ordinal" | "matchesCount" | "userId" | "identifier">
	>;
}
