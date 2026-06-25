import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

// Window function (latest Skill row per user) rather than a self-join against a
// `max(id)` subquery: the self-join lets the planner pick a nested-loop plan when
// it misjudges the season's row count (e.g. a freshly started season whose stats
// are dwarfed by older seasons), which made this query take ~12s. This form is
// plan-stable regardless of stats.
const userStm = sql.prepare(/* sql */ `
  select "ordinal", "matchesCount", "userId"
  from (
    select
      "ordinal",
      "matchesCount",
      "userId",
      row_number() over (partition by "userId" order by "id" desc) as "rn"
    from "Skill"
    where "season" = @season and "userId" is not null
  )
  where "rn" = 1
  order by "ordinal" desc
`);

export function orderedUserMMRBySeason(season: number) {
	return userStm.all({ season }) as Array<
		Pick<Tables["Skill"], "ordinal" | "matchesCount" | "userId">
	>;
}
