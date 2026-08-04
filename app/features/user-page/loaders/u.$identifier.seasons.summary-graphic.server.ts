import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as SeasonSummary from "~/features/img-export/core/SeasonSummary";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { userSkills } from "~/features/mmr/tiered.server";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { forbidden, notFoundIfNullish } from "~/utils/remix.server";
import { resolveAvatarUrl } from "~/utils/urls";
import { userParamsSchema } from "../user-page-schemas";
import { userSeasonSummaryGraphicSearchParams } from "../user-page-search-params";

const BEST_SETS_COUNT = 3;
/** The graphic shows fewer than this when it also has weapons to show */
const TOP_MATES_COUNT = 6;

export type UserSeasonSummaryGraphicLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const loggedInUser = requireUser();
	const { identifier } = userParamsSchema.parse(params);
	const { season } = userSeasonSummaryGraphicSearchParams.parse(url);
	if (typeof season !== "number") {
		throw new Response(null, { status: 400 });
	}

	const user = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(identifier),
	);
	const seasonsParticipatedIn =
		await LeaderboardRepository.findSeasonsParticipatedInByUserId(user.id);
	const skill = (await userSkills(season)).userSkills[user.id];

	if (
		!skill ||
		skill.approximate ||
		!SeasonSummary.canExportSeasonSummary({
			loggedInUser,
			profileUserId: user.id,
			season,
			seasonsParticipatedIn,
			hasCalculatedSkill: true,
		})
	) {
		throw forbidden();
	}

	const setScores = await PlayerStatRepository.findSeasonSetScoresByUserId({
		userId: user.id,
		season,
	});
	const setWinrate = await PlayerStatRepository.findSeasonSetWinrateByUserId({
		userId: user.id,
		season,
	});
	const mapWinrate = await PlayerStatRepository.findSeasonMapWinrateByUserId({
		userId: user.id,
		season,
	});

	const soloRank = (
		await LeaderboardRepository.findUserSPLeaderboard(season)
	).find((entry) => entry.id === user.id)?.placementRank;
	const teamEntry = await findTeamEntry({ season, userId: user.id });

	const mates = await PlayerStatRepository.findSeasonMatesEnemiesByUserId({
		userId: user.id,
		season,
		type: "MATE",
	});
	const topMates = mates
		.toSorted((a, b) => b.setWins + b.setLosses - (a.setWins + a.setLosses))
		.slice(0, TOP_MATES_COUNT);

	const countries = await UserRepository.findCountriesByUserIds([
		...(teamEntry?.entry.members.map((member) => member.id) ?? []),
		...topMates.map((mate) => mate.user.id),
	]);

	const bestSets = await PlayerStatRepository.findSeasonBestSetsByUserId({
		userId: user.id,
		season,
		limit: BEST_SETS_COUNT,
	});
	const bestRun = SeasonSummary.bestTournamentRun(
		(
			await PlayerStatRepository.findSeasonTournamentRunsByUserId({
				userId: user.id,
				season,
			})
		).map((run) => ({
			...run,
			topEightAvgSp:
				typeof run.topEightAvgOrdinal === "number"
					? ordinalToSp(run.topEightAvgOrdinal)
					: null,
		})),
	);

	return {
		season,
		tier: skill.tier,
		sp: ordinalToSp(skill.ordinal),
		setsWon: setWinrate.wins,
		setsLost: setWinrate.losses,
		mapsWon: mapWinrate.wins,
		mapsLost: mapWinrate.losses,
		longestWinStreak: SeasonSummary.longestWinStreak(setScores),
		clutch: SeasonSummary.clutchRecord(setScores),
		soloRank,
		teamRank: teamEntry
			? {
					rank: teamEntry.rank,
					sp: teamEntry.entry.power,
					mates: teamEntry.entry.members
						.filter((member) => member.id !== user.id)
						.map((member) => ({
							name: member.username,
							countryCode: countries.get(member.id),
						})),
					team: teamEntry.entry.team
						? {
								name: teamEntry.entry.team.name,
								logoUrl: teamEntry.entry.team.avatarUrl ?? undefined,
							}
						: undefined,
				}
			: undefined,
		topMates: topMates.map((mate) => ({
			player: {
				name: mate.user.username,
				countryCode: countries.get(mate.user.id),
			},
			discordId: mate.user.discordId,
			avatarUrl: resolveAvatarUrl({
				customAvatarUrl: mate.user.customAvatarUrl,
				discordId: mate.user.discordId,
				discordAvatar: mate.user.discordAvatar,
				size: "sm",
			}),
			setsCount: mate.setWins + mate.setLosses,
		})),
		bestStage: SeasonSummary.bestStage(
			await PlayerStatRepository.findSeasonStagesByUserId({
				userId: user.id,
				season,
			}),
		),
		spProgression: (
			await SkillRepository.findSeasonProgressionByUserId({
				userId: user.id,
				season,
			})
		).map((point) => ({ date: point.date, sp: ordinalToSp(point.ordinal) })),
		activeDays: await SkillRepository.findSeasonActiveDaysByUserId({
			userId: user.id,
			season,
		}),
		bestSets: bestSets.map((set) => ({
			opponentPlayers: set.opponentPlayers.map((player) => ({
				name: player.username,
				countryCode: player.country ?? undefined,
			})),
			ownScore: set.ownScore,
			opponentScore: set.opponentScore,
			opponentSp: ordinalToSp(set.avgOpponentOrdinal),
			context: set.tournamentName ?? "SendouQ",
		})),
		bestTournament: bestRun
			? {
					name: bestRun.name,
					logoUrl: bestRun.logoUrl,
					tier: bestRun.tier ?? undefined,
					placement: bestRun.placement,
					teamsCount: bestRun.teamsCount,
				}
			: undefined,
		topWeapons: SeasonSummary.topWeaponUsages(
			await ReportedWeaponRepository.findSeasonReportedWeaponsByUserId({
				userId: user.id,
				season,
			}),
		),
	};
};

async function findTeamEntry({
	season,
	userId,
}: {
	season: number;
	userId: number;
}) {
	const hasUser = (entry: { members: Array<{ id: number }> }) =>
		entry.members.some((member) => member.id === userId);

	const rankedEntry = (
		await LeaderboardRepository.findTeamLeaderboardBySeason({
			season,
			onlyOneEntryPerUser: true,
		})
	).find(hasUser);

	if (rankedEntry)
		return { entry: rankedEntry, rank: rankedEntry.placementRank };

	// rosters that only show up on the "all entries" leaderboard have no
	// placement comparable to the one shown on the main team leaderboard
	const unrankedEntry = (
		await LeaderboardRepository.findTeamLeaderboardBySeason({
			season,
			onlyOneEntryPerUser: false,
		})
	).find(hasUser);

	if (!unrankedEntry) return undefined;

	return { entry: unrankedEntry, rank: undefined };
}
