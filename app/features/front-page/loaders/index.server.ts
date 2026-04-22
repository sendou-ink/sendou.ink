import cachified from "@epic-web/cachified";
import type { Tables } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import * as Changelog from "~/features/front-page/core/Changelog.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { databaseTimestampNow } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { discordAvatarUrl, teamPage, userPage } from "~/utils/urls";
import * as ShowcaseTournaments from "../core/ShowcaseTournaments.server";

export type FrontPageLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const user = getUser();

	const [tournaments, changelog, leaderboards, rotations, weaponPool] =
		await Promise.all([
			ShowcaseTournaments.categorizedTournamentsByUserId(null),
			cachified({
				key: "front-changelog",
				cache,
				ttl: ttl(IN_MILLISECONDS.ONE_HOUR),
				staleWhileRevalidate: ttl(IN_MILLISECONDS.TWO_HOURS),
				async getFreshValue() {
					return Changelog.get();
				},
			}),
			cachedLeaderboards(),
			SplatoonRotationRepository.findAll(),
			user
				? QSettingsRepository.settingsByUserId(user.id).then(
						(s) => s.qWeaponPool ?? null,
					)
				: Promise.resolve(null),
		]);

	return {
		tournaments,
		changelog,
		leaderboards,
		rotations,
		weaponPool,
		now: databaseTimestampNow(),
	};
};

export interface LeaderboardEntry {
	name: string;
	url: string;
	avatarUrl: string | null;
	power: number;
}

const ENTRIES_PER_LEADERBOARD = 5;

function cachedLeaderboards(): Promise<{
	user: LeaderboardEntry[];
	team: LeaderboardEntry[];
}> {
	return cachified({
		key: "front-leaderboard",
		cache,
		ttl: ttl(IN_MILLISECONDS.ONE_HOUR),
		staleWhileRevalidate: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			const season = Seasons.currentOrPrevious()?.nth ?? 1;

			const [team, user] = await Promise.all([
				LeaderboardRepository.teamLeaderboardBySeason({
					season,
					onlyOneEntryPerUser: true,
				}),
				cachedFullUserLeaderboard(season),
			]);

			return {
				user: user.slice(0, ENTRIES_PER_LEADERBOARD).map((entry) => ({
					power: entry.power,
					name: entry.username,
					url: userPage(entry),
					avatarUrl: entry.discordAvatar
						? discordAvatarUrl({
								discordAvatar: entry.discordAvatar,
								discordId: entry.discordId,
								size: "sm",
							})
						: null,
				})),
				team: team
					.filter((entry) => entry.team)
					.slice(0, ENTRIES_PER_LEADERBOARD)
					.map((entry) => {
						const team = entry.team as Pick<
							Tables["Team"],
							"id" | "name" | "customUrl"
						> & { avatarUrl: string | null };

						return {
							power: entry.power,
							name: team.name,
							url: teamPage(team.customUrl),
							avatarUrl: team.avatarUrl,
						};
					}),
			};
		},
	});
}
