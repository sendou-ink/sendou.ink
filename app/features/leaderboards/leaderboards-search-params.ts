import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { LEADERBOARD_TYPES } from "./leaderboards-constants";

export const leaderboardsSearchParams = SearchParams.define({
	type: SP.param(v.picklist(LEADERBOARD_TYPES), {
		default: LEADERBOARD_TYPES[0],
		loader: true,
	}),
	season: SP.param(v.nullable(v.pipe(v.number(), v.integer())), {
		loader: true,
	}),
});
