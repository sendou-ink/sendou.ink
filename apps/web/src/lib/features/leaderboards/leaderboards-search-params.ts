import * as v from "valibot";
import * as SearchParams from "#lib/modules/search-params/search-params.ts";
import { SP } from "#lib/modules/search-params/search-params.ts";
import { LEADERBOARD_TYPES } from "./leaderboards-constants.ts";

export const leaderboardsSearchParams = SearchParams.define({
	type: SP.param(v.picklist(LEADERBOARD_TYPES), {
		default: LEADERBOARD_TYPES[0],
	}),
	season: SP.param(v.nullable(v.pipe(v.number(), v.integer())), {
	}),
});
