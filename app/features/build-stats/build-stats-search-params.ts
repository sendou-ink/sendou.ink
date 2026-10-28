import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { RECENT_PATCHES } from "../builds/builds-constants";
import { ANY_TIME } from "./build-stats-constants";

export const buildStatsSearchParams = SearchParams.define({
	/** `YYYY-MM-DD` the builds were updated after, `null` lets the loader pick (see `DEFAULT_UPDATED_SINCE`). */
	date: SP.param(
		v.nullable(
			v.picklist([ANY_TIME, ...RECENT_PATCHES.map((patch) => patch.date)]),
		),
		{ loader: true },
	),
});
