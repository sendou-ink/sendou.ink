import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
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

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const loggedInUser = requireUser();
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

	const { season = seasonsParticipatedIn[0] } = parsedSearchParams.success
		? parsedSearchParams.data
		: {};

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
		canceled: loggedInUser.roles.includes("STAFF")
			? await SQMatchRepository.seasonCanceledMatchesByUserId({
					season,
					userId: user.id,
				})
			: null,
		season,
	};
};
