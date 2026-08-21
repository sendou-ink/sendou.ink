import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const authErrorSearchParams = SearchParams.define({
	authError: SP.param(v.nullable(v.string()), { loader: false }),
});
