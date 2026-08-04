import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { SEARCH_TYPES } from "./search-types";

export const searchSearchParams = SearchParams.define({
	q: SP.param(z.string().max(100), { default: "", loader: true }),
	type: SP.param(z.enum(SEARCH_TYPES), { default: "users", loader: true }),
	limit: SP.param(z.number().int().min(1).max(25), {
		default: 10,
		loader: true,
	}),
});
