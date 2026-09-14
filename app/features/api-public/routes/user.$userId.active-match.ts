import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetUsersActiveMatchResponse } from "../schema";

const paramsSchema = v.object({
	userId: id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { userId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const activity = UserActivity.resolve(userId);

	if (activity.sendouq?.group.matchId) {
		const result: GetUsersActiveMatchResponse = {
			matchId: activity.sendouq.group.matchId,
			lobby: "sendouq",
			tournamentId: null,
			bracketIdx: null,
		};
		return Response.json(result);
	}

	for (const { tournament, status } of activity.tournaments) {
		if (status.type === "MATCH") {
			const result: GetUsersActiveMatchResponse = {
				matchId: status.matchId,
				lobby: "tournament",
				tournamentId: tournament.ctx.id,
				bracketIdx: tournament.matchIdToBracketIdx(status.matchId),
			};
			return Response.json(result);
		}
	}

	const result: GetUsersActiveMatchResponse = {
		matchId: null,
		lobby: null,
		tournamentId: null,
		bracketIdx: null,
	};
	return Response.json(result);
};
