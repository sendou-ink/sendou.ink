import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import { userParamsSchema } from "../user-page-schemas";
import { userSeasonsSearchParams } from "../user-page-search-params";

export type UserSeasonsStatsLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	requireUser();
	const { identifier } = userParamsSchema.parse(params);
	const { info, season: seasonParam } = userSeasonsSearchParams.parse(url);

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
		season,
		stages:
			info === "stages"
				? await PlayerStatRepository.findSeasonStagesByUserId({
						season,
						userId: user.id,
					})
				: null,
		weapons:
			info === "weapons"
				? await ReportedWeaponRepository.findSeasonReportedWeaponsByUserId({
						season,
						userId: user.id,
					})
				: null,
		players:
			info === "enemies" || info === "mates"
				? await PlayerStatRepository.findSeasonMatesEnemiesByUserId({
						season,
						userId: user.id,
						type: info === "enemies" ? "ENEMY" : "MATE",
					})
				: null,
	};
};
