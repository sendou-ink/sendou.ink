import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import {
	filterToSmallStr,
	type LFGFilter,
	smallStrToFilter,
} from "./lfg-types";

const lfgFiltersCodec = z.codec(
	z.string(),
	z.custom<LFGFilter[]>((value) => Array.isArray(value)),
	{
		decode: (queryString) =>
			queryString === ""
				? []
				: queryString
						.split("-")
						.map(smallStrToFilter)
						.filter((filter) => filter !== null),
		encode: (filters) => filters.map(filterToSmallStr).join("-"),
	},
);

export const lfgSearchParams = SearchParams.define({
	q: SP.custom(lfgFiltersCodec, { default: [], loader: false }),
});

export const lfgNewSearchParams = SearchParams.define({
	postId: SP.param(z.number().int().positive().nullable(), { loader: true }),
});
