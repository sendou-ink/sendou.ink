import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontPageData,
	type LeaderboardEntry,
} from "./queries/front-page";

export type { LeaderboardEntry };

export type FrontPageData = Awaited<ReturnType<typeof fetchFrontPageData>>;

export const frontPageQueryOptions = () =>
	queryOptions({
		queryKey: ["front-page"],
		queryFn: () => fetchFrontPageData(),
		staleTime: 60_000,
	});
