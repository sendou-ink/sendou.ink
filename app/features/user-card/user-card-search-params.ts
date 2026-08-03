import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const userCardEditSearchParams = SearchParams.define({
	returnTo: SP.param(
		z
			.string()
			.refine((value) => value.startsWith("/") && !value.startsWith("//"))
			.nullable(),
		{ loader: true },
	),
});

export const userCardFriendshipSearchParams = SearchParams.define({
	mutuals: SP.param(z.boolean(), { default: false, loader: true }),
});
