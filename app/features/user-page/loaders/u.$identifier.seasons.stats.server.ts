import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { rankedUserSkill } from "~/features/mmr/tiered.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import type { SerializeFrom } from "~/utils/remix";
import * as SeasonPlayerActivity from "../core/SeasonPlayerActivity";
import { userSeasonsStatsSearchParams } from "../user-page-search-params";

export type UserSeasonsStatsLoaderData = NonNullable<
	SerializeFrom<typeof loader>
>;

const OVERVIEW_PLAYERS_COUNT = 4;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	requireUser();
	const { season: seasonParam, tab } = userSeasonsStatsSearchParams.parse(url);

	const userId = userPageUserId();
	const seasonsParticipatedIn =
		await LeaderboardRepository.findSeasonsParticipatedInByUserId(userId);

	if (seasonsParticipatedIn.length === 0) {
		return null;
	}

	const args = { season: seasonParam ?? seasonsParticipatedIn[0], userId };
	const tabToLoad = seasonsParticipatedIn.includes(args.season) ? tab : null;

	return {
		season: args.season,
		seasonsParticipatedIn,
		tab,
		overview: tabToLoad === "overview" ? await overview(args) : null,
		stages:
			tabToLoad === "stages"
				? await PlayerStatRepository.findSeasonStagesByUserId(args)
				: null,
		weapons:
			tabToLoad === "weapons"
				? await ReportedWeaponRepository.findSeasonReportedWeaponsByUserId(args)
				: null,
		players:
			tabToLoad === "mates" || tabToLoad === "enemies"
				? await playersWithActivity({
						...args,
						type: tabToLoad === "mates" ? "MATE" : "ENEMY",
					})
				: null,
	};
};

async function overview(args: { season: number; userId: number }) {
	const [
		skill,
		maps,
		sets,
		tournamentPlacements,
		skills,
		stages,
		weapons,
		mates,
		enemies,
	] = await Promise.all([
		rankedUserSkill(args),
		PlayerStatRepository.findSeasonMapWinrateByUserId(args),
		PlayerStatRepository.findSeasonSetWinrateByUserId(args),
		PlayerStatRepository.findSeasonTournamentPlacementsByUserId(args),
		SkillRepository.findSeasonProgressionByUserId(args),
		PlayerStatRepository.findSeasonStagesByUserId(args),
		ReportedWeaponRepository.findSeasonReportedWeaponsByUserId(args),
		PlayerStatRepository.findSeasonMatesEnemiesByUserId({
			...args,
			type: "MATE",
		}),
		PlayerStatRepository.findSeasonMatesEnemiesByUserId({
			...args,
			type: "ENEMY",
		}),
	]);

	return {
		skill,
		winrates: { maps, sets },
		tournaments: {
			count: tournamentPlacements.length,
			bestPlacement:
				tournamentPlacements.length > 0
					? Math.min(...tournamentPlacements.map((t) => t.placement))
					: null,
		},
		skills,
		stages,
		weapons,
		mates: mates.slice(0, OVERVIEW_PLAYERS_COUNT),
		enemies: enemies.slice(0, OVERVIEW_PLAYERS_COUNT),
	};
}

async function playersWithActivity(args: {
	season: number;
	userId: number;
	type: "MATE" | "ENEMY";
}) {
	const [players, setParticipants] = await Promise.all([
		PlayerStatRepository.findSeasonMatesEnemiesByUserId(args),
		PlayerStatRepository.findSeasonSetParticipantsByUserId(args),
	]);

	const activity = SeasonPlayerActivity.summarize(setParticipants);

	return {
		activityWeeks: activity.weeks,
		list: players.map((player) => ({
			...player,
			setsPerWeek: activity.players[args.type].get(player.user.id) ?? [],
		})),
	};
}
