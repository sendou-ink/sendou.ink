import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const teamJoinSearchParams = SearchParams.define({
	code: SP.param(z.string().nullable(), { loader: true }),
});
