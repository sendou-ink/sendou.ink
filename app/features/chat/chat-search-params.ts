import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const chatUsersSearchParams = SearchParams.define({
	ids: SP.param(z.array(z.number().int().positive()), {
		default: [],
		loader: true,
	}),
});
