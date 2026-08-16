import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { logger } from "~/utils/logger";
import { parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { clearCachedTeamLeaderboards } from "../core/leaderboards.server";
import { leaderboardsActionSchema } from "../leaderboards-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	requireRole("STAFF");
	const user = requireUser();

	const data = await parseRequestPayload({
		request,
		schema: leaderboardsActionSchema,
	});

	switch (data._action) {
		case "SKIP_TEAM": {
			await LeaderboardRepository.insertTeamSkip({
				season: data.season,
				identifier: data.identifier,
			});
			logger.info(
				`Team leaderboard: user ${user.id} skipped team ${data.identifier} of season ${data.season}`,
			);

			break;
		}
		case "UNSKIP_TEAM": {
			await LeaderboardRepository.deleteTeamSkip({
				season: data.season,
				identifier: data.identifier,
			});
			logger.info(
				`Team leaderboard: user ${user.id} unskipped team ${data.identifier} of season ${data.season}`,
			);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearCachedTeamLeaderboards(data.season);

	return null;
};
