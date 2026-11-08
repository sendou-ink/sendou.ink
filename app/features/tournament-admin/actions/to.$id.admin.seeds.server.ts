import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
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
		// not `for: "organizer"`: the public API maps only this error toast to a 400
		requireTournamentOrganizer(tournament, user);

		let message: string;
		switch (body._action) {
			case "UPDATE_SEEDS": {
				errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

				await TournamentRepository.updateTeamSeeds({
					tournamentId,
					teamIds: onlyTeamsOfTournament(tournament, body.seeds, (id) => id),
				});

				message = "Seeds saved successfully";
				break;
			}
			case "UPDATE_STARTING_BRACKETS": {
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

				await TournamentTeamRepository.updateStartingBrackets(
					onlyTeamsOfTournament(
						tournament,
						body.startingBrackets,
						(t) => t.tournamentTeamId,
					),
				);

				message = "Starting brackets updated";
				break;
			}
			case "UPDATE_AB_DIVISIONS": {
				errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

				errorToastIfFalsy(
					tournament.ctx.settings.bracketProgression.some(
						(bracket) => !bracket.sources && bracket.settings?.hasAbDivisions,
					),
					"No starting bracket has A/B divisions enabled",
				);

				await TournamentTeamRepository.updateAbDivisions(
					onlyTeamsOfTournament(
						tournament,
						body.abDivisions,
						(t) => t.tournamentTeamId,
					),
				);

				message = "A/B divisions updated";
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		clearTournamentDataCache(tournamentId);

		ChatSystemMessage.send({ channel: tournamentChannel(tournamentId) });

		return successToast(message);
	},
);

/** Skips teams that unregistered after the organizer loaded the page (and ids of other tournaments' teams). */
function onlyTeamsOfTournament<T>(
	tournament: Tournament,
	items: T[],
	tournamentTeamId: (item: T) => number,
) {
	const validTeamIds = new Set(tournament.ctx.teams.map((t) => t.id));

	return items.filter((item) => validTeamIds.has(tournamentTeamId(item)));
}
