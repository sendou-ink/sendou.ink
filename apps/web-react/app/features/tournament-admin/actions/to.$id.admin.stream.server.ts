import type { ActionFunction } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { adminStreamFormSchema } from "../tournament-admin-staff-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "organizer",
	});

	const result = await parseFormData({
		request,
		schema: adminStreamFormSchema,
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	await TournamentRepository.updateCastTwitchAccounts({
		tournamentId: tournament.ctx.id,
		castTwitchAccounts: result.data.castTwitchAccounts,
	});

	clearTournamentDataCache(tournamentId);

	return null;
};
