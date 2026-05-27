import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetUsersActiveMatchResponse } from "../schema";

const paramsSchema = z.object({
	userId: id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { userId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const sendouqGroup = SendouQ.findOwnGroup(userId);
	if (sendouqGroup?.matchId) {
		const result: GetUsersActiveMatchResponse = {
			matchId: sendouqGroup.matchId,
			lobby: "sendouq",
			tournamentId: null,
			bracketIdx: null,
		};
		return Response.json(result);
	}

	for (const tournament of RunningTournaments.all) {
		const status = tournament.teamMemberOfProgressStatus({ id: userId });
		if (status?.type === "MATCH") {
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
