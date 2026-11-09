import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	clearTournamentDataCache,
	requireTournamentAdmin,
	requireTournamentOrganizer,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy, successToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { adminBracketsActionSchema } from "../tournament-admin-schemas";

export const action = defineAction(
	{ body: adminBracketsActionSchema },
	async ({ params, body }) => {
		const { tournament, tournamentId, user } = await tournamentFromParams(
			params,
			{ for: "action" },
		);

		let message: string;
		switch (body._action) {
			case "RESET_BRACKET": {
				requireTournamentOrganizer(tournament, user);
				errorToastIfFalsy(
					!tournament.ctx.isFinalized,
					"Tournament is finalized",
				);

				const bracketToResetIdx = tournament.brackets.findIndex(
					(b) => b.id === body.stageId,
				);
				const bracketToReset = tournament.brackets[bracketToResetIdx];
				errorToastIfFalsy(bracketToReset, "Invalid bracket id");
				errorToastIfFalsy(!bracketToReset.preview, "Bracket has not started");

				const inProgressBrackets = tournament.brackets.filter(
					(b) => !b.preview,
				);
				errorToastIfFalsy(
					inProgressBrackets.every(
						(b) =>
							!b.sources ||
							b.sources.every((s) => s.bracketIdx !== bracketToResetIdx),
					),
					"Some bracket that sources teams from this bracket has started",
				);

				await BracketRepository.resetBracket(body.stageId);

				message = "Bracket reset";
				break;
			}
			case "UPDATE_TOURNAMENT_PROGRESSION": {
				requireTournamentOrganizer(tournament, user);
				errorToastIfFalsy(
					!tournament.ctx.isFinalized,
					"Tournament is finalized",
				);

				errorToastIfFalsy(
					Progression.changedBracketProgression(
						tournament.ctx.settings.bracketProgression,
						body.bracketProgression,
					).every(
						(changedBracketIdx) =>
							tournament.bracketByIdx(changedBracketIdx)?.preview,
					),
					"Can't change started brackets",
				);
				errorToastIfFalsy(
					!Progression.changedStartingBrackets(
						tournament.ctx.settings.bracketProgression,
						body.bracketProgression,
					),
					"Can't add, remove or move divisions after the tournament has started",
				);

				await TournamentRepository.updateProgression({
					tournamentId: tournament.ctx.id,
					bracketProgression: body.bracketProgression,
				});

				message = "Tournament progression updated";
				break;
			}
			case "REOPEN_TOURNAMENT": {
				requireTournamentAdmin(tournament, user);
				errorToastIfFalsy(
					DANGEROUS_CAN_ACCESS_DEV_CONTROLS,
					"Only available in development",
				);
				errorToastIfFalsy(
					tournament.ctx.isFinalized,
					"Tournament is not finalized",
				);

				await TournamentRepository.reopenTournament(tournamentId);

				message = "Tournament reopened";
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		clearTournamentDataCache(tournamentId);

		ChatSystemMessage.send({ channel: tournamentChannel(tournamentId) });

		successToast(message);
	},
);
