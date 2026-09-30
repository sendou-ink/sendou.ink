import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const teamJoinSearchParams = SearchParams.define({
	code: SP.param(v.nullable(v.string()), { loader: true }),
});
