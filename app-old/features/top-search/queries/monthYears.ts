import { sql } from "~/db/sql";
import type { MonthYear } from "../top-search-utils";

const smt = sql.prepare(/* sql */ `
  select
    "month",
    "year"
  from "XRankPlacement"
  group by "month", "year"
  order by "year" desc, "month" desc
`);

export function monthYears() {
	const rows = smt.all() as MonthYear[];

	return rows;
}
