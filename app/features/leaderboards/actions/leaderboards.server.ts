import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { clearCachedTeamLeaderboards } from "../core/leaderboards.server";
import { leaderboardsActionSchema } from "../leaderboards-schemas";

export const action = defineAction(
	{ body: leaderboardsActionSchema },
	async ({ body }) => {
		requireRole("STAFF");
		const user = requireUser();

		switch (body._action) {
			case "SKIP_TEAM": {
				await LeaderboardRepository.insertTeamSkip({
					season: body.season,
					identifier: body.identifier,
				});
				logger.info(
					`Team leaderboard: user ${user.id} skipped team ${body.identifier} of season ${body.season}`,
				);

				break;
			}
			case "UNSKIP_TEAM": {
				await LeaderboardRepository.deleteTeamSkip({
					season: body.season,
					identifier: body.identifier,
				});
				logger.info(
					`Team leaderboard: user ${user.id} unskipped team ${body.identifier} of season ${body.season}`,
				);

				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		clearCachedTeamLeaderboards(body.season);

		return null;
	},
);
