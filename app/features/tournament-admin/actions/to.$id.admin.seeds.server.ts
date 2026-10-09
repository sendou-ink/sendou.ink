import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy, successToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { adminSeedsActionSchema } from "../tournament-admin-schemas";

export const action = defineAction(
	{ body: adminSeedsActionSchema },
	async ({ params, body }) => {
		const { tournament, tournamentId, user } = await tournamentFromParams(
			params,
			{ for: "action" },
		);

		let message: string;
		switch (body._action) {
			case "UPDATE_SEEDS": {
				requireTournamentOrganizer(tournament, user);
				errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");
				validateTeamsOfTournament(tournament, body.seeds);

				await TournamentRepository.updateTeamSeeds({
					tournamentId,
					teamIds: body.seeds,
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
					body.startingBrackets.every((t) =>
						validBracketIdxs.includes(t.startingBracketIdx),
					),
					"Invalid starting bracket idx",
				);
				validateTeamsOfTournament(
					tournament,
					body.startingBrackets.map((t) => t.tournamentTeamId),
				);

				await TournamentTeamRepository.updateStartingBrackets(
					body.startingBrackets,
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

				validateTeamsOfTournament(
					tournament,
					body.abDivisions.map((t) => t.tournamentTeamId),
				);

				await TournamentTeamRepository.updateAbDivisions(body.abDivisions);

				message = "A/B divisions updated";
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		clearTournamentDataCache(tournamentId);

		return successToast(message);
	},
);

function validateTeamsOfTournament(
	tournament: Tournament,
	tournamentTeamIds: number[],
) {
	const validTeamIds = new Set(tournament.ctx.teams.map((t) => t.id));

	errorToastIfFalsy(
		tournamentTeamIds.every((id) => validTeamIds.has(id)),
		"Invalid tournament team id",
	);
}
