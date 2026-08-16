import { LEADERBOARDS_PAGE } from "~/utils/urls";
import { leaderboardsSearchParams } from "./leaderboards-search-params";

export const leaderboardsPage = (args: {
	season?: number;
	type?: "USER" | "TEAM";
}) =>
	leaderboardsSearchParams.href(LEADERBOARDS_PAGE, {
		season: args.season ?? null,
		...(args.type ? { type: args.type } : {}),
	});
