import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const chatUsersSearchParams = SearchParams.define({
	ids: SP.param(v.array(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		default: [],
		loader: true,
	}),
});
