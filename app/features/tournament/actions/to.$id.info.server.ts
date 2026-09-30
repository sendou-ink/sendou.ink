import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import { TOURNAMENT } from "../tournament-constants";
import { saveTournamentSchema } from "../tournament-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const data = await parseRequestPayload({
		request,
		schema: saveTournamentSchema,
	});

	switch (data._action) {
		case "SAVE_TOURNAMENT": {
			const count = await SavedCalendarEventRepository.countByUserId(user.id);
			errorToastIfFalsy(
				count < TOURNAMENT.MAX_SAVED_COUNT,
				"Maximum saved tournaments reached",
			);

			await SavedCalendarEventRepository.saveOwn(tournamentId);
			break;
		}
		case "UNSAVE_TOURNAMENT": {
			await SavedCalendarEventRepository.unsaveByUserId({
				userId: user.id,
				tournamentId,
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
