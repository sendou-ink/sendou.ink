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
import { assertUnreachable } from "~/utils/types";
import { idObject } from "../../../utils/zod";
import * as TournamentRepository from "../TournamentRepository.server";
import { adminStreamActionSchema } from "../tournament-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: adminStreamActionSchema,
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
		case "UPDATE_CAST_TWITCH_ACCOUNTS": {
			validateIsTournamentOrganizer();
			await TournamentRepository.updateCastTwitchAccounts({
				tournamentId: tournament.ctx.id,
				castTwitchAccounts: data.castTwitchAccounts,
			});

			message = "Cast account updated";
			break;
		}
		default: {
			assertUnreachable(data._action);
		}
	}

	clearTournamentDataCache(tournamentId);

	return successToast(message);
};
