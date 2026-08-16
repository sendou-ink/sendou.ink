import type {
	MainWeaponId,
	RankedModeShort,
} from "@sendou/in-game-lists/types";
import type { weaponCategories } from "@sendou/in-game-lists/weapon-ids";
import { logger } from "@sendou/utils/logger";
import { getUser, requireUser } from "#lib/features/auth/user.server.ts";
import { requireRole } from "#lib/modules/permissions/guards.server.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";
import { command, prerender, query, requested } from "$app/server";
import * as Seasons from "../mmr/Seasons.ts";
import * as LeaderboardRepository from "./LeaderboardRepository.server.ts";
import {
	WEAPON_LEADERBOARD_MAX_SIZE,
	XP_LEADERBOARD_TYPES,
	type XPLeaderboardType,
} from "./leaderboards-constants.ts";
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
	xpLeaderboardTypeSchema,
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
			season,
		};
	},
);

// prerendered data would be baked from the build machine's database, so the
// e2e build keeps this as a regular query against the per-worker test dbs
export const getXPLeaderboard = IS_E2E_TEST_RUN
	? query(xpLeaderboardTypeSchema, findXPLeaderboard)
	: prerender(xpLeaderboardTypeSchema, findXPLeaderboard, {
			inputs: () => [...XP_LEADERBOARD_TYPES],
		});

function findXPLeaderboard(type: XPLeaderboardType) {
	if (type === "XP-ALL") {
		return LeaderboardRepository.findAllXPLeaderboard();
	}

	if (type.startsWith("XP-MODE")) {
		return LeaderboardRepository.findModeXPLeaderboard(
			type.split("-")[2] as RankedModeShort,
		);
	}

	return LeaderboardRepository.findWeaponXPLeaderboard(
		Number(type.split("-")[2]) as MainWeaponId,
	);
}

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
		await requested(getLeaderboards, 5).refreshAll();
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
		await requested(getLeaderboards, 5).refreshAll();
	},
);
