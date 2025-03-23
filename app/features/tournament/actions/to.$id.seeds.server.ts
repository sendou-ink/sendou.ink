import type { ActionFunction } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import * as TournamentTeamRepository from "../TournamentTeamRepository.server";
import { updateTeamSeeds } from "../queries/updateTeamSeeds.server";
import { seedsActionSchema } from "../tournament-schemas.server";
import { tournamentIdFromParams } from "../tournament-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: seedsActionSchema,
	});
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
	errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

	switch (data._action) {
		case "UPDATE_SEEDS": {
			updateTeamSeeds({ tournamentId, teamIds: data.seeds });
			break;
		}
		case "UPDATE_STARTING_BRACKETS": {
			const validBracketIdxs =
				tournament.ctx.settings.bracketProgression.flatMap(
					(bracket, bracketIdx) => (!bracket.sources ? [bracketIdx] : []),
				);

			errorToastIfFalsy(
				data.startingBrackets.every((t) =>
					validBracketIdxs.includes(t.startingBracketIdx),
				),
				"Invalid starting bracket idx",
			);

			await TournamentTeamRepository.updateStartingBrackets(
				data.startingBrackets,
			);
			break;
		}
	}

	clearTournamentDataCache(tournamentId);

	return null;
};
