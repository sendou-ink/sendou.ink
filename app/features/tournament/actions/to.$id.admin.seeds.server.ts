import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "../../../utils/zod";
import * as TournamentRepository from "../TournamentRepository.server";
import { adminSeedsActionSchema } from "../tournament-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: adminSeedsActionSchema,
	});

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateIsTournamentOrganizer = () =>
		errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

	let message: string;
	switch (data._action) {
		case "UPDATE_SEEDS": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			const teamsWithMembers = tournament.ctx.teams
				.filter((t) => data.seeds.includes(t.id))
				.map((team) => ({
					teamId: team.id,
					members: team.members.map((m) => ({
						userId: m.userId,
						username: m.username,
					})),
				}));

			await TournamentRepository.updateTeamSeeds({
				tournamentId,
				teamIds: data.seeds,
				teamsWithMembers,
			});

			message = "Seeds saved successfully";
			break;
		}
		case "UPDATE_STARTING_BRACKETS": {
			validateIsTournamentOrganizer();
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
			validateIsTournamentOrganizer();
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
