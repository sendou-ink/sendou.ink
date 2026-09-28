import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import { databaseTimestampToDate, dateToYYYYMMDD } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import type { SerializeFrom } from "~/utils/remix";
import type { SeasonResultSource } from "../user-page-constants";
import { userSeasonResultsSearchParams } from "../user-page-search-params";

export type UserSeasonResultsLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	requireUser();

	const {
		season: seasonParam,
		page,
		source,
	} = userSeasonResultsSearchParams.parse(url);

	const userId = userPageUserId();
	const season =
		seasonParam ??
		(await LeaderboardRepository.findSeasonsParticipatedInByUserId(userId)).at(
			0,
		);

	if (typeof season !== "number") {
		return null;
	}

	return seasonResults({ season, userId, page, source });
};

/** A page of season results grouped by day (UTC), each day summarized including its sets on other pages. */
async function seasonResults(args: {
	season: number;
	userId: number;
	page: number;
	source: SeasonResultSource;
}) {
	const results = await SQMatchRepository.findSeasonResultsByUserId(args);

	const resultsByDate = new Map<string, typeof results>();
	for (const result of results) {
		const date = dateToYYYYMMDD(databaseTimestampToDate(result.createdAt));
		resultsByDate.set(date, [...(resultsByDate.get(date) ?? []), result]);
	}

	const summaries =
		resultsByDate.size > 0
			? await SQMatchRepository.findSeasonDaySummariesByUserId({
					...args,
					dates: Array.from(resultsByDate.keys()),
				})
			: [];

	return {
		days: Array.from(resultsByDate, ([date, dayResults]) => {
			const summary = summaries.find((day) => day.date === date);
			invariant(summary, `Missing summary of ${date}`);

			return { summary, results: dayResults };
		}),
		currentPage: args.page,
		pagesCount: await SQMatchRepository.countSeasonResultPagesByUserId(args),
	};
}
