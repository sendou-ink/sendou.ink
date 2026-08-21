import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const PLUS_TIER_PARAMS = ["1", "2", "3"] as const;

export type PlusTierParam = (typeof PLUS_TIER_PARAMS)[number];

export const plusSuggestionsSearchParams = SearchParams.define({
	tier: SP.param(v.picklist(PLUS_TIER_PARAMS), { default: "1", loader: true }),
	alert: SP.param(v.boolean(), { default: false, loader: false }),
	editingSuggestionId: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
		{
			loader: false,
		},
	),
});
