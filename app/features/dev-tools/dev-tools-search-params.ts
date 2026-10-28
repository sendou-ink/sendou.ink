import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const logInAsSearchParams = SearchParams.define({
	/** `null` stops impersonating. */
	userId: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))), {
		loader: true,
	}),
	returnTo: SP.param(v.nullable(v.pipe(v.string(), v.startsWith("/"))), {
		loader: true,
	}),
});

export const usersSearchParams = SearchParams.define({
	ids: SP.param(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), {
		default: [],
		loader: true,
	}),
});
