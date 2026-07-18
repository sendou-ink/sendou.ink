import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy } from "~/utils/remix.server";
import {
	seasonsSearchParamsSchema,
	userParamsSchema,
} from "../user-page-schemas";

export type UserSeasonsSetsLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	requireUser();
	const { identifier } = userParamsSchema.parse(params);
	const parsedSearchParams = seasonsSearchParamsSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);

	const user = notFoundIfFalsy(
		await UserRepository.identifierToUserId(identifier),
	);
	const seasonsParticipatedIn =
		await LeaderboardRepository.seasonsParticipatedInByUserId(user.id);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const { page = 1, season = seasonsParticipatedIn[0] } =
		parsedSearchParams.success ? parsedSearchParams.data : {};

	return {
		results: {
			value: await SQMatchRepository.seasonResultsByUserId({
				season,
				userId: user.id,
				page,
			}),
			currentPage: page,
			pages: await SQMatchRepository.seasonResultPagesByUserId({
				season,
				userId: user.id,
			}),
		},
		season,
	};
};
