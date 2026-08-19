import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { SHORT_NANOID_LENGTH } from "~/utils/id";

export const associationsSearchParams = SearchParams.define({
	inviteCode: SP.param(
		v.nullable(v.pipe(v.string(), v.length(SHORT_NANOID_LENGTH))),
		{
			loader: true,
		},
	),
});
