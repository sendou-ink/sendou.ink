import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	errorToastIfFalsy,
	forbidden,
	notFoundIfNullish,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { CALENDAR_PAGE } from "~/utils/urls";

export const action = defineAction(
	{ params: idObject },
	async ({ params: { id } }) => {
		const event = notFoundIfNullish(await CalendarRepository.findById(id));

		if (event.tournamentId) {
			const user = requireUser();
			const tournament = await tournamentFromDB(event.tournamentId);

			if (!tournament.canEditEventInfo(user)) {
				forbidden();
			}

			errorToastIfFalsy(
				!tournament.hasStarted,
				"Tournament has already started",
			);
		} else {
			requirePermission(event, "DELETE");
		}

		await CalendarRepository.deleteById(event.eventId);

		if (event.tournamentId) {
			clearTournamentDataCache(event.tournamentId);
			ShowcaseTournaments.clearParticipationInfoMap();
			ShowcaseTournaments.clearCachedTournaments();
		}

		throw redirect(CALENDAR_PAGE);
	},
);
