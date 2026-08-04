import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import { userParamsSchema } from "../user-page-schemas";
import { userSeasonsSearchParams } from "../user-page-search-params";

export type UserSeasonsSetsLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	requireUser();
	const { identifier } = userParamsSchema.parse(params);
	const { page, season: seasonParam } = userSeasonsSearchParams.parse(url);

	const user = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(identifier),
	);
	const seasonsParticipatedIn =
		await LeaderboardRepository.findSeasonsParticipatedInByUserId(user.id);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const season = seasonParam ?? seasonsParticipatedIn[0];

	return {
		results: {
			value: await SQMatchRepository.findSeasonResultsByUserId({
				season,
				userId: user.id,
				page,
			}),
			currentPage: page,
			pagesCount: await SQMatchRepository.countSeasonResultPagesByUserId({
				season,
				userId: user.id,
			}),
		},
		season,
	};
};
