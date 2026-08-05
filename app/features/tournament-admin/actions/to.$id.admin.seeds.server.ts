import type { ActionFunction } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { adminSeedsActionSchema } from "../tournament-admin-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: adminSeedsActionSchema,
	});

	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);

	let message: string;
	switch (data._action) {
		case "UPDATE_SEEDS": {
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			await TournamentRepository.updateTeamSeeds({
				tournamentId,
				teamIds: data.seeds,
			});

			message = "Seeds saved successfully";
			break;
		}
		case "UPDATE_STARTING_BRACKETS": {
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

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

			message = "Starting brackets updated";
			break;
		}
		case "UPDATE_AB_DIVISIONS": {
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			errorToastIfFalsy(
				tournament.ctx.settings.bracketProgression.some(
					(bracket) => !bracket.sources && bracket.settings?.hasAbDivisions,
				),
				"No starting bracket has A/B divisions enabled",
			);

			const validTeamIds = new Set(tournament.ctx.teams.map((t) => t.id));
			errorToastIfFalsy(
				data.abDivisions.every((t) => validTeamIds.has(t.tournamentTeamId)),
				"Invalid tournament team id",
			);

			await TournamentTeamRepository.updateAbDivisions(data.abDivisions);

			message = "A/B divisions updated";
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return successToast(message);
};
