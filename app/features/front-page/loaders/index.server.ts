import cachified from "@epic-web/cachified";
import { hoursToMilliseconds } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import type { Tables } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import * as FeedPage from "~/features/feed/core/FeedPage.server";
import { feedSearchParams } from "~/features/feed/feed-search-params";
import { isFeedTester } from "~/features/feed/feed-utils";
import * as Changelog from "~/features/front-page/core/Changelog.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import { cache, ttl } from "~/utils/cache.server";
import { databaseTimestampNow } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { avatarUrl, teamPage, userPage } from "~/utils/urls";
import * as ShowcaseTournaments from "../core/ShowcaseTournaments.server";

export type FrontPageLoaderData = Extract<
	SerializeFrom<typeof loader>,
	{ feed: null }
>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = getUser();

	if (isFeedTester(user) && user?.preferences?.newHomePage) {
		const { viewAs, test } = feedSearchParams.parse(request);

		return {
			feed: await FeedPage.load({
				viewerId: viewAs ?? user.id,
				userId: user.id,
				mode: test ? "TEST" : "REAL",
			}),
		};
	}

	const [tournaments, changelog, leaderboards, rotations, weaponPool] =
		await Promise.all([
			ShowcaseTournaments.categorizedTournamentsByUserId(null),
			cachified({
				key: "front-changelog",
				cache,
				ttl: ttl(hoursToMilliseconds(1)),
				staleWhileRevalidate: ttl(hoursToMilliseconds(2)),
				async getFreshValue() {
					return Changelog.get();
				},
			}),
			cachedLeaderboards(),
			SplatoonRotationRepository.findAll(),
			user
				? MatchProfileRepository.findSettingsByUserId(user.id).then(
						(s) => s.weaponPool ?? null,
					)
				: Promise.resolve(null),
		]);

	return {
		feed: null,
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
		ttl: ttl(hoursToMilliseconds(1)),
		staleWhileRevalidate: ttl(hoursToMilliseconds(2)),
		async getFreshValue() {
			const season = Seasons.currentOrPrevious()?.nth ?? 1;

			const [team, user] = await Promise.all([
				LeaderboardRepository.findTeamLeaderboardBySeason({
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
					avatarUrl: entry.avatar ? avatarUrl(entry.avatar, "sm") : null,
				})),
				team: team
					.filter((entry) => entry.team)
					.slice(0, ENTRIES_PER_LEADERBOARD)
					.map((entry) => {
						const entryTeam = entry.team as Pick<
							Tables["Team"],
							"id" | "name" | "customUrl"
						> & { avatarUrl: string | null };

						return {
							power: entry.power,
							name: entryTeam.name,
							url: teamPage(entryTeam.customUrl),
							avatarUrl: entryTeam.avatarUrl,
						};
					}),
			};
		},
	});
}
