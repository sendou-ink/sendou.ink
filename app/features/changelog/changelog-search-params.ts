import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export const changelogSearchParams = SearchParams.define({
	since: SP.param(v.nullable(v.pipe(v.string(), v.regex(COMMIT_SHA_PATTERN))), {
		loader: true,
	}),
});
