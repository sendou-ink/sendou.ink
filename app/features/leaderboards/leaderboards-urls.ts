import { LEADERBOARDS_PAGE } from "~/utils/urls";
import type { LEADERBOARD_TYPES } from "./leaderboards-constants";
import { leaderboardsSearchParams } from "./leaderboards-search-params";

export const leaderboardsPage = (args: {
	season?: number;
	type?: (typeof LEADERBOARD_TYPES)[number];
}) =>
	leaderboardsSearchParams.href(LEADERBOARDS_PAGE, {
		season: args.season ?? null,
		...(args.type ? { type: args.type } : {}),
	});
