import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentOrganizationSearchParams = SearchParams.define({
	month: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11))),
		{ loader: true },
	),
	year: SP.param(
		v.nullable(
			v.pipe(v.number(), v.integer(), v.minValue(2020), v.maxValue(2100)),
		),
		{
			loader: true,
		},
	),
	series: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
	page: SP.page({ max: 100 }),
	source: SP.param(v.nullable(v.string()), { loader: true }),
});
