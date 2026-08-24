import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	errorToastIfFalsy,
	forbidden,
	notFoundIfNullish,
} from "~/utils/remix.server";
import { actualNumber, id, preprocess } from "~/utils/schema";
import { CALENDAR_PAGE } from "~/utils/urls";

export const action: ActionFunction = async ({ params }) => {
	const parsedParams = v.parse(
		v.object({ id: preprocess(actualNumber, id) }),
		params,
	);
	const event = notFoundIfNullish(
		await CalendarRepository.findById(parsedParams.id),
	);

	if (event.tournamentId) {
		const user = requireUser();
		const tournament = await tournamentFromDB(event.tournamentId);

		if (!tournament.canEditEventInfo(user)) {
			throw forbidden();
		}

		errorToastIfFalsy(!tournament.hasStarted, "Tournament has already started");
	} else {
		requirePermission(event, "DELETE");
	}

	await CalendarRepository.deleteById({
		eventId: event.eventId,
		tournamentId: event.tournamentId,
	});

	if (event.tournamentId) {
		clearTournamentDataCache(event.tournamentId);
		ShowcaseTournaments.clearParticipationInfoMap();
		ShowcaseTournaments.clearCachedTournaments();
	}

	throw redirect(CALENDAR_PAGE);
};
