import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const PLUS_TIER_PARAMS = ["1", "2", "3"] as const;

export type PlusTierParam = (typeof PLUS_TIER_PARAMS)[number];

export const plusSuggestionsSearchParams = SearchParams.define({
	tier: SP.param(z.enum(PLUS_TIER_PARAMS).nullable(), { loader: false }),
	alert: SP.param(z.boolean(), { default: false, loader: false }),
	editingSuggestionId: SP.param(z.number().int().positive().nullable(), {
		loader: false,
	}),
});
