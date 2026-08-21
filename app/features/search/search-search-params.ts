import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { SEARCH_TYPES } from "./search-types";

export const searchSearchParams = SearchParams.define({
	q: SP.param(v.pipe(v.string(), v.maxLength(100)), {
		default: "",
		loader: true,
	}),
	type: SP.param(v.picklist(SEARCH_TYPES), { default: "users", loader: true }),
	limit: SP.param(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
		{
			default: 10,
			loader: true,
		},
	),
});
