import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
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
import { idObject } from "~/utils/zod";
import * as TournamentRepository from "../TournamentRepository.server";
import * as TournamentTeamRepository from "../TournamentTeamRepository.server";
import { seedsActionSchema } from "../tournament-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: seedsActionSchema,
	});
	const user = requireUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
	errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

	switch (data._action) {
		case "UPDATE_SEEDS": {
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
			clearTournamentDataCache(tournamentId);
			return successToast("Seeds saved successfully");
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
