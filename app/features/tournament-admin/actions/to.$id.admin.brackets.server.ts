import type { ActionFunction } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
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
import { adminBracketsActionSchema } from "../tournament-admin-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: adminBracketsActionSchema,
	});

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateIsTournamentAdmin = () =>
		errorToastIfFalsy(tournament.isAdmin(user), "Unauthorized");
	const validateIsTournamentOrganizer = () =>
		errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

	let message: string;
	switch (data._action) {
		case "RESET_BRACKET": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(!tournament.ctx.isFinalized, "Tournament is finalized");

			const bracketToResetIdx = tournament.brackets.findIndex(
				(b) => b.id === data.stageId,
			);
			const bracketToReset = tournament.brackets[bracketToResetIdx];
			errorToastIfFalsy(bracketToReset, "Invalid bracket id");
			errorToastIfFalsy(!bracketToReset.preview, "Bracket has not started");

			const inProgressBrackets = tournament.brackets.filter((b) => !b.preview);
			errorToastIfFalsy(
				inProgressBrackets.every(
					(b) =>
						!b.sources ||
						b.sources.every((s) => s.bracketIdx !== bracketToResetIdx),
				),
				"Some bracket that sources teams from this bracket has started",
			);

			await TournamentRepository.resetBracket(data.stageId);

			message = "Bracket reset";
			break;
		}
		case "UPDATE_TOURNAMENT_PROGRESSION": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(!tournament.ctx.isFinalized, "Tournament is finalized");

			errorToastIfFalsy(
				Progression.changedBracketProgression(
					tournament.ctx.settings.bracketProgression,
					data.bracketProgression,
				).every(
					(changedBracketIdx) =>
						tournament.bracketByIdx(changedBracketIdx)?.preview,
				),
				"Can't change started brackets",
			);

			await TournamentRepository.updateProgression({
				tournamentId: tournament.ctx.id,
				bracketProgression: data.bracketProgression,
			});

			message = "Tournament progression updated";
			break;
		}
		case "REOPEN_TOURNAMENT": {
			validateIsTournamentAdmin();
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
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return successToast(message);
};
