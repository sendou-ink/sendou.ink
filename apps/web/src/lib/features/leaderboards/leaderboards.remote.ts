import type {
	MainWeaponId,
	RankedModeShort,
} from "@sendou/in-game-lists/types";
import type { weaponCategories } from "@sendou/in-game-lists/weapon-ids";
import { logger } from "@sendou/utils/logger";
import { getUser, requireUser } from "#lib/features/auth/user.server.ts";
import { requireRole } from "#lib/modules/permissions/guards.server.ts";
import { command, query } from "$app/server";
import * as Seasons from "../mmr/Seasons.ts";
import * as LeaderboardRepository from "./LeaderboardRepository.server.ts";
import { WEAPON_LEADERBOARD_MAX_SIZE } from "./leaderboards-constants.ts";
import {
	cachedFullUserLeaderboard,
	cachedTeamLeaderboard,
	clearCachedTeamLeaderboards,
	filterByWeaponCategory,
	ownEntryPeek,
	shownUserLeaderboard,
} from "./leaderboards-core.server.ts";
import {
	leaderboardsQuerySchema,
	teamLeaderboardEntrySchema,
} from "./leaderboards-schemas.ts";

export const getLeaderboards = query(
	leaderboardsQuerySchema,
	async ({ type, season: seasonParam }) => {
		const user = getUser();

		const season =
			Seasons.allStarted().find((s) => s === seasonParam) ??
			Seasons.currentOrPrevious()!.nth;

		const fullUserLeaderboard = type.includes("USER")
			? await cachedFullUserLeaderboard(season)
			: null;

		const userLeaderboard = fullUserLeaderboard
			? shownUserLeaderboard(fullUserLeaderboard)
			: undefined;

		const teamLeaderboard =
			type === "TEAM" || type === "TEAM-ALL"
				? await cachedTeamLeaderboard({
						season,
						onlyOneEntryPerUser: type !== "TEAM-ALL",
					})
				: null;

		const isWeaponLeaderboard = userLeaderboard && type !== "USER";

		const filteredLeaderboard = isWeaponLeaderboard
			? filterByWeaponCategory(
					fullUserLeaderboard!,
					type.split("-")[1] as (typeof weaponCategories)[number]["name"],
				).slice(0, WEAPON_LEADERBOARD_MAX_SIZE)
			: userLeaderboard;

		const showOwnEntryPeek =
			fullUserLeaderboard && !isWeaponLeaderboard && user;

		const xpLeaderboard =
			type === "XP-ALL"
				? await LeaderboardRepository.findAllXPLeaderboard()
				: type.startsWith("XP-MODE")
					? await LeaderboardRepository.findModeXPLeaderboard(
							type.split("-")[2] as RankedModeShort,
						)
					: type.startsWith("XP-WEAPON")
						? await LeaderboardRepository.findWeaponXPLeaderboard(
								Number(type.split("-")[2]) as MainWeaponId,
							)
						: null;

		return {
			userLeaderboard: filteredLeaderboard ?? userLeaderboard,
			ownEntryPeek: showOwnEntryPeek
				? await ownEntryPeek({
						leaderboard: fullUserLeaderboard,
						season,
						userId: user.id,
					})
				: null,
			teamLeaderboard,
			xpLeaderboard,
			season,
		};
	},
);

export const skipTeam = command(
	teamLeaderboardEntrySchema,
	async ({ season, identifier }) => {
		requireRole("STAFF");
		const user = requireUser();

		await LeaderboardRepository.insertTeamSkip({ season, identifier });
		logger.info(
			`Team leaderboard: user ${user.id} skipped team ${identifier} of season ${season}`,
		);

		clearCachedTeamLeaderboards(season);
		void getLeaderboards({ type: "TEAM", season }).refresh();
	},
);

export const unskipTeam = command(
	teamLeaderboardEntrySchema,
	async ({ season, identifier }) => {
		requireRole("STAFF");
		const user = requireUser();

		await LeaderboardRepository.deleteTeamSkip({ season, identifier });
		logger.info(
			`Team leaderboard: user ${user.id} unskipped team ${identifier} of season ${season}`,
		);

		clearCachedTeamLeaderboards(season);
		void getLeaderboards({ type: "TEAM", season }).refresh();
	},
);
