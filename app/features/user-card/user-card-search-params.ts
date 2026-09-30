import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const userCardEditSearchParams = SearchParams.define({
	returnTo: SP.param(
		v.nullable(
			v.pipe(
				v.string(),
				v.check((value) => value.startsWith("/") && !value.startsWith("//")),
			),
		),
		{ loader: true },
	),
});

export const userCardFriendshipSearchParams = SearchParams.define({
	mutuals: SP.param(v.boolean(), { default: false, loader: true }),
});
