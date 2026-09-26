import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { seasonStanding } from "../core/season-standing.server";
import { userSeasonsStatsSearchParams } from "../user-page-search-params";

export type UserSeasonsStatsLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	requireUser();
	const { season: seasonParam } = userSeasonsStatsSearchParams.parse(url);

	const userId = userPageUserId();
	const seasonsParticipatedIn =
		await LeaderboardRepository.findSeasonsParticipatedInByUserId(userId);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const season = seasonParam ?? seasonsParticipatedIn[0];

	const [
		standing,
		maps,
		sets,
		tournamentPlacements,
		skills,
		stages,
		weapons,
		mates,
		enemies,
	] = await Promise.all([
		seasonStanding({ userId, season }),
		PlayerStatRepository.findSeasonMapWinrateByUserId({ season, userId }),
		PlayerStatRepository.findSeasonSetWinrateByUserId({ season, userId }),
		PlayerStatRepository.findSeasonTournamentPlacementsByUserId({
			season,
			userId,
		}),
		SkillRepository.findSeasonProgressionByUserId({ season, userId }),
		PlayerStatRepository.findSeasonStagesByUserId({ season, userId }),
		ReportedWeaponRepository.findSeasonReportedWeaponsByUserId({
			season,
			userId,
		}),
		PlayerStatRepository.findSeasonMatesEnemiesByUserId({
			season,
			userId,
			type: "MATE",
		}),
		PlayerStatRepository.findSeasonMatesEnemiesByUserId({
			season,
			userId,
			type: "ENEMY",
		}),
	]);

	return {
		...standing,
		winrates: { maps, sets },
		tournaments: {
			count: tournamentPlacements.length,
			bestPlacement:
				tournamentPlacements.length > 0
					? Math.min(...tournamentPlacements.map((t) => t.placement))
					: null,
		},
		season,
		seasonsParticipatedIn,
		skills,
		stages,
		weapons,
		mates,
		enemies,
	};
};
