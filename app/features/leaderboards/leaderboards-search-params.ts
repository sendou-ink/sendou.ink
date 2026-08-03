import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { LEADERBOARD_TYPES } from "./leaderboards-constants";

export const leaderboardsSearchParams = SearchParams.define({
	type: SP.param(z.enum(LEADERBOARD_TYPES), {
		default: LEADERBOARD_TYPES[0],
		loader: true,
	}),
	season: SP.param(z.number().int().nullable(), { loader: true }),
});
