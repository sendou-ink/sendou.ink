import { requireUser } from "~/features/auth/core/user.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import { TOURNAMENT } from "../tournament-constants";
import { saveTournamentSchema } from "../tournament-schemas";

export const action = defineAction(
	{ params: idObject, body: saveTournamentSchema },
	async ({ params: { id: tournamentId }, body }) => {
		const user = requireUser();

		switch (body._action) {
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
				assertUnreachable(body);
			}
		}

		return null;
	},
);
