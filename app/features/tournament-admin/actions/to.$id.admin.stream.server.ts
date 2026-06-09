import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { adminStreamFormSchema } from "../tournament-admin-staff-schemas";
import { requireTournamentOrganizer } from "../tournament-admin-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	requireTournamentOrganizer(tournament, user);

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
