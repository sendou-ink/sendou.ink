import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { HALF_HOUR_IN_MS } from "~/constants";
import { getUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import type {
	MainWeaponId,
	RankedModeShort,
} from "~/modules/in-game-lists/types";
import type { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { cache, ttl } from "~/utils/cache.server";
import {
	cachedFullUserLeaderboard,
	filterByWeaponCategory,
	ownEntryPeek,
} from "../core/leaderboards.server";
import {
	DEFAULT_LEADERBOARD_MAX_SIZE,
	LEADERBOARD_TYPES,
	SEASON_SEARCH_PARAM_KEY,
	TYPE_SEARCH_PARAM_KEY,
	WEAPON_LEADERBOARD_MAX_SIZE,
} from "../leaderboards-constants";
import {
	allXPLeaderboard,
	modeXPLeaderboard,
	weaponXPLeaderboard,
} from "../queries/XPLeaderboard.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const unvalidatedType = new URL(request.url).searchParams.get(
		TYPE_SEARCH_PARAM_KEY,
	);
	const unvalidatedSeason = new URL(request.url).searchParams.get(
		SEASON_SEARCH_PARAM_KEY,
	);

	const type =
		LEADERBOARD_TYPES.find((type) => type === unvalidatedType) ??
		LEADERBOARD_TYPES[0];
	const season =
		Seasons.allStarted().find(
			(s) => unvalidatedSeason && s === Number(unvalidatedSeason),
		) ?? Seasons.currentOrPrevious()!.nth;

	const fullUserLeaderboard = type.includes("USER")
		? await cachedFullUserLeaderboard(season)
		: null;

	const userLeaderboard = fullUserLeaderboard?.slice(
		0,
		DEFAULT_LEADERBOARD_MAX_SIZE,
	);

	const teamLeaderboard =
		type === "TEAM" || type === "TEAM-ALL"
			? await cachified({
					key: `team-leaderboard-season-${season}-${type}`,
					cache,
					ttl: ttl(HALF_HOUR_IN_MS),
					async getFreshValue() {
						return LeaderboardRepository.teamLeaderboardBySeason({
							season,
							onlyOneEntryPerUser: type !== "TEAM-ALL",
						});
					},
				})
			: null;

	const isWeaponLeaderboard = userLeaderboard && type !== "USER";

	const filteredLeaderboard = isWeaponLeaderboard
		? filterByWeaponCategory(
				fullUserLeaderboard!,
				type.split("-")[1] as (typeof weaponCategories)[number]["name"],
			).slice(0, WEAPON_LEADERBOARD_MAX_SIZE)
		: userLeaderboard;

	const showOwnEntryPeek = fullUserLeaderboard && !isWeaponLeaderboard && user;

	return {
		userLeaderboard: filteredLeaderboard ?? userLeaderboard,
		ownEntryPeek: showOwnEntryPeek
			? ownEntryPeek({
					leaderboard: fullUserLeaderboard,
					season,
					userId: user.id,
				})
			: null,
		teamLeaderboard,
		xpLeaderboard:
			type === "XP-ALL"
				? allXPLeaderboard()
				: type.startsWith("XP-MODE")
					? modeXPLeaderboard(type.split("-")[2] as RankedModeShort)
					: type.startsWith("XP-WEAPON")
						? weaponXPLeaderboard(Number(type.split("-")[2]) as MainWeaponId)
						: null,
		season,
	};
};
