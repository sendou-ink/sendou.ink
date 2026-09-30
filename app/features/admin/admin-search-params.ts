import * as v from "valibot";
import { FRIEND_CODE_REGEXP } from "~/features/sendouq/q-constants";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const adminSearchParams = SearchParams.define({
	friendCode: SP.param(
		v.nullable(v.pipe(v.string(), v.regex(FRIEND_CODE_REGEXP))),
		{
			loader: true,
		},
	),
});
