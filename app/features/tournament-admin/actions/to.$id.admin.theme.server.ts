import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { errorToastIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { adminThemeActionSchema } from "../tournament-admin-schemas.server";
import { requireTournamentAdmin } from "../tournament-admin-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	requireTournamentAdmin(tournament, user);
	errorToastIfFalsy(
		tournament.ctx.organization?.isEstablished,
		"Tournament is not hosted by an established organization",
	);

	const result = await parseFormData({
		request,
		schema: adminThemeActionSchema,
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	await TournamentRepository.updateCustomTheme({
		tournamentId,
		customTheme: result.data.newValue
			? clampThemeToGamut(result.data.newValue)
			: null,
	});

	clearTournamentDataCache(tournamentId);

	return { ok: true };
};
