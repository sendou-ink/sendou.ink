import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentBracketsSearchParams = SearchParams.define({
	idx: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))), {
		loader: true,
		resets: ["group"],
	}),
	/** Group of a bracket whose groups are viewed one at a time (swiss, elimination split into groups). */
	group: SP.param(v.nullable(v.pipe(v.number(), v.integer())), {
		loader: true,
	}),
	/** Starting bracket idx of the league division whose brackets are shown. Leagues only. */
	division: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
		{
			loader: true,
			resets: ["idx", "group"],
		},
	),
});
