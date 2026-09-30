import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { inGameNameIsValid } from "~/features/user-page/in-game-name";
import {
	badRequestIfFalsy,
	parseBody,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = v.object({
	id,
	teamId: id,
});

const bodySchema = v.object({
	userId: id,
	inGameName: v.pipe(v.string(), v.check(inGameNameIsValid)),
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
		const tournament = await tournamentFromDB(tournamentId);
		requireTournamentOrganizer(tournament, user);

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
