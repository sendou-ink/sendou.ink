import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const authErrorSearchParams = SearchParams.define({
	authError: SP.param(z.string().nullable(), { loader: false }),
});
