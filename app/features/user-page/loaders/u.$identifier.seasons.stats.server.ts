import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy } from "~/utils/remix.server";
import {
	seasonsSearchParamsSchema,
	userParamsSchema,
} from "../user-page-schemas";

export type UserSeasonsStatsLoaderData = NonNullable<
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

	const { info = "weapons", season = seasonsParticipatedIn[0] } =
		parsedSearchParams.success ? parsedSearchParams.data : {};

	return {
		season,
		stages:
			info === "stages"
				? await PlayerStatRepository.seasonStagesByUserId({
						season,
						userId: user.id,
					})
				: null,
		weapons:
			info === "weapons"
				? await ReportedWeaponRepository.seasonReportedWeaponsByUserId({
						season,
						userId: user.id,
					})
				: null,
		players:
			info === "enemies" || info === "mates"
				? await PlayerStatRepository.seasonMatesEnemiesByUserId({
						season,
						userId: user.id,
						type: info === "enemies" ? "ENEMY" : "MATE",
					})
				: null,
	};
};
