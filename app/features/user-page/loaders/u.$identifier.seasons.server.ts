import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy } from "~/utils/remix.server";
import {
	seasonsSearchParamsSchema,
	userParamsSchema,
} from "../user-page-schemas";

export type UserSeasonsPageLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = getUser();
	const { identifier } = userParamsSchema.parse(params);
	const parsedSearchParams = seasonsSearchParamsSchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	);

	const user = notFoundIfFalsy(
		await UserRepository.identifierToUserId(identifier),
	);
	const seasonsParticipatedIn =
		await LeaderboardRepository.seasonsParticipatedInByUserId(user.id);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const {
		info = "weapons",
		page = 1,
		season = seasonsParticipatedIn[0],
	} = parsedSearchParams.success ? parsedSearchParams.data : {};

	const { isAccurateTiers, userSkills } = _userSkills(season);
	const { tier, ordinal, approximate } = userSkills[user.id] ?? {
		approximate: false,
		ordinal: 0,
		tier: { isPlus: false, name: "IRON" },
	};

	return {
		seasonsParticipatedIn,
		currentOrdinal: !approximate ? ordinal : undefined,
		winrates: {
			maps: await PlayerStatRepository.seasonMapWinrateByUserId({
				season,
				userId: user.id,
			}),
			sets: await PlayerStatRepository.seasonSetWinrateByUserId({
				season,
				userId: user.id,
			}),
		},
		skills: await SkillRepository.seasonProgressionByUserId({
			season,
			userId: user.id,
		}),
		tier,
		isAccurateTiers,
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
		canceled: loggedInUser?.roles.includes("STAFF")
			? await SQMatchRepository.seasonCanceledMatchesByUserId({
					season,
					userId: user.id,
				})
			: null,
		season,
		info: {
			currentTab: info,
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
		},
	};
};
