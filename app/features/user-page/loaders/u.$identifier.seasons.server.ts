import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import { userParamsSchema } from "../user-page-schemas";
import { userSeasonsSearchParams } from "../user-page-search-params";

export type UserSeasonsPageLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const loggedInUser = requireUser();
	const { identifier } = userParamsSchema.parse(params);
	const { season: seasonParam } = userSeasonsSearchParams.parse(url);

	const user = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(identifier),
	);
	const seasonsParticipatedIn =
		await LeaderboardRepository.findSeasonsParticipatedInByUserId(user.id);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const season = seasonParam ?? seasonsParticipatedIn[0];

	const { isAccurateTiers, userSkills } = await _userSkills(season);
	const { tier, ordinal, approximate } = userSkills[user.id] ?? {
		approximate: false,
		ordinal: 0,
		tier: { isPlus: false, name: "IRON" },
	};

	return {
		seasonsParticipatedIn,
		currentOrdinal: !approximate ? ordinal : undefined,
		winrates: {
			maps: await PlayerStatRepository.findSeasonMapWinrateByUserId({
				season,
				userId: user.id,
			}),
			sets: await PlayerStatRepository.findSeasonSetWinrateByUserId({
				season,
				userId: user.id,
			}),
		},
		skills: await SkillRepository.findSeasonProgressionByUserId({
			season,
			userId: user.id,
		}),
		tier,
		isAccurateTiers,
		canceled: loggedInUser.roles.includes("STAFF")
			? await SQMatchRepository.findSeasonCanceledMatchesByUserId({
					season,
					userId: user.id,
				})
			: null,
		season,
	};
};
