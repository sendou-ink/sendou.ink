import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { ONE_HOUR_IN_MS, TWO_HOURS_IN_MS } from "~/constants";
import type { Tables } from "~/db/tables";
import { getUserId } from "~/features/auth/core/user.server";
import * as Changelog from "~/features/front-page/core/Changelog.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import { cache, ttl } from "~/utils/cache.server";
import {
	discordAvatarUrl,
	teamPage,
	userPage,
	userSubmittedImage,
} from "~/utils/urls";
import * as ShowcaseTournaments from "../core/ShowcaseTournaments.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);

	const [tournaments, changelog, leaderboards] = await Promise.all([
		ShowcaseTournaments.frontPageTournamentsByUserId(user?.id ?? null),
		cachified({
			key: "front-changelog",
			cache,
			ttl: ttl(ONE_HOUR_IN_MS),
			staleWhileRevalidate: ttl(TWO_HOURS_IN_MS),
			async getFreshValue() {
				return Changelog.get();
			},
		}),
		cachedLeaderboards(),
	]);

	return {
		tournaments,
		changelog,
		leaderboards,
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
		ttl: ttl(ONE_HOUR_IN_MS),
		staleWhileRevalidate: ttl(TWO_HOURS_IN_MS),
		async getFreshValue() {
			const season = currentOrPreviousSeason(new Date())?.nth ?? 1;

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
							avatarUrl: team.avatarUrl
								? userSubmittedImage(team.avatarUrl)
								: null,
						};
					}),
			};
		},
	});
}
