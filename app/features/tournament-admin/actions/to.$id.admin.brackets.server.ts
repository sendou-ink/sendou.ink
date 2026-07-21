import type { ActionFunction } from "react-router";
import { sql } from "~/db/sql";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { requireUser } from "~/features/auth/core/user.server";
import { updateRoundMaps } from "~/features/tournament/queries/updateRoundMaps.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { roundMapsFromInput } from "~/features/tournament-match/core/mapList.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "../../../utils/zod";
import { adminBracketsActionSchema } from "../tournament-admin-schemas.server";
import {
	requireTournamentAdmin,
	requireTournamentOrganizer,
} from "../tournament-admin-utils.server";

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

	let message: string;
	switch (data._action) {
		case "RESET_BRACKET": {
			requireTournamentOrganizer(tournament, user);
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
			requireTournamentOrganizer(tournament, user);
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
		case "EDIT_ROUND_MAPS": {
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(!tournament.ctx.isFinalized, "Tournament is finalized");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			errorToastIfFalsy(bracket, "Bracket not found");
			errorToastIfFalsy(!bracket.preview, "Bracket has not started");

			// the bracket already exists, so the live rounds are both the "virtual"
			// (input) and the real (DB) rounds; roundMapsFromInput handles fanning a
			// single row out across all rr/swiss groups sharing the round number
			const resolvedMaps = roundMapsFromInput({
				virtualRounds: bracket.data.round,
				roundsFromDB: bracket.data.round,
				maps: data.maps,
				bracket,
			});

			// never touch rounds that have already started, even if a stale or
			// tampered client submitted them
			const editableMaps = resolvedMaps.filter(
				(map) => !bracket.roundSettingsLocked(map.roundId),
			);

			sql.transaction(() => {
				updateRoundMaps(editableMaps);
			})();

			message = "Round settings updated";
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
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return successToast(message);
};
