import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { inGameNameIsValid } from "~/features/user-page/in-game-name";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseBody,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = z.object({
	id,
	teamId: id,
});

const bodySchema = z.object({
	userId: id,
	inGameName: z.string().refine(inGameNameIsValid),
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const { userId, inGameName } = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

	return wrapActionForApi(async () => {
		const user = requireUser();
		const tournament = await tournamentFromDB({ tournamentId, user });
		errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

		const teamMemberOf = badRequestIfFalsy(
			tournament.teamMemberOfByUser({ id: userId }),
		);

		await TournamentTeamRepository.updateMemberInGameName({
			userId,
			inGameName,
			tournamentTeamId: teamMemberOf.id,
		});

		clearTournamentDataCache(tournamentId);

		return null;
	}, args);
};
