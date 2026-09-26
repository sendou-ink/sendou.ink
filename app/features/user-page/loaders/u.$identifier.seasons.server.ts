import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as SeasonSummary from "~/features/img-export/core/SeasonSummary";
import { cachedTeamLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { ordinalToRoundedSp } from "~/features/mmr/mmr-utils";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { userSkills } from "~/features/mmr/tiered.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { userSeasonsSearchParams } from "../user-page-search-params";

export type UserSeasonsPageLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const loggedInUser = requireUser();
	const {
		season: seasonParam,
		page,
		source,
	} = userSeasonsSearchParams.parse(url);

	const userId = userPageUserId();
	const seasonsParticipatedIn =
		await LeaderboardRepository.findSeasonsParticipatedInByUserId(userId);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const season = seasonParam ?? seasonsParticipatedIn[0];

	const seasonOverviews = await Promise.all(
		seasonsParticipatedIn.map(async (nth) => {
			const skill = (await userSkills(nth)).userSkills[userId];
			const isRanked = skill && !skill.approximate;

			return {
				season: nth,
				tier: isRanked ? skill.tier : null,
				sp: isRanked ? ordinalToRoundedSp(skill.ordinal) : null,
			};
		}),
	);

	return {
		season,
		seasonsParticipatedIn,
		seasonOverviews,
		hasCalculatedSkill: seasonOverviews.some(
			(overview) => overview.season === season && overview.tier !== null,
		),
		activeDays: await SkillRepository.findSeasonActiveDaysByUserId({
			season,
			userId,
		}),
		statsPeek: await statsPeek({ season, userId }),
		teamEntry: await teamEntry({ season, userId }),
		results: {
			value: await SQMatchRepository.findSeasonResultsByUserId({
				season,
				userId,
				page,
				source,
			}),
			currentPage: page,
			pagesCount: await SQMatchRepository.countSeasonResultPagesByUserId({
				season,
				userId,
				source,
			}),
		},
		canceled: loggedInUser.roles.includes("STAFF")
			? await SQMatchRepository.findSeasonCanceledMatchesByUserId({
					season,
					userId,
				})
			: null,
	};
};

async function statsPeek(args: { season: number; userId: number }) {
	const [stages, weapons, mates] = await Promise.all([
		PlayerStatRepository.findSeasonStagesByUserId(args),
		ReportedWeaponRepository.findSeasonReportedWeaponsByUserId(args),
		PlayerStatRepository.findSeasonMatesEnemiesByUserId({
			...args,
			type: "MATE",
		}),
	]);

	const topMate = mates.at(0);
	const topWeapon = SeasonSummary.topWeaponUsages(weapons).at(0) ?? null;

	return {
		bestStage:
			SeasonSummary.bestStage(stages) ??
			SeasonSummary.mostPlayedStage(stages) ??
			null,
		topWeapon,
		topMode: topWeapon ? null : SeasonSummary.topModeUsage(stages),
		topMate: topMate
			? {
					user: topMate.user,
					setsCount: topMate.setWins + topMate.setLosses,
				}
			: null,
	};
}

/** The user's highest roster on the season's "all rosters" team leaderboard */
async function teamEntry({
	season,
	userId,
}: {
	season: number;
	userId: number;
}) {
	const entry = (
		await cachedTeamLeaderboard({ season, onlyOneEntryPerUser: false })
	).find((rosterEntry) =>
		rosterEntry.members.some((member) => member.id === userId),
	);
	if (!entry) return null;

	return {
		placement: entry.placementRank,
		sp: entry.power,
		members: entry.members,
		team: entry.team ?? null,
	};
}
