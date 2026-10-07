import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const chatSearchParams = SearchParams.define({
	chat: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))), {
		loader: false,
	}),
});
