import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const formSearchParams = SearchParams.define({
	/** Name of the current step of a multi-step form, `null` for the first step. */
	step: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(100))), {
		loader: false,
	}),
});
