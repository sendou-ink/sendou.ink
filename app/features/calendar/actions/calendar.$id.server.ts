import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { z } from "zod";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import {
	clearTournamentDataCache,
	tournamentManagerData,
} from "~/features/tournament-bracket/core/Tournament.server";
import { canDeleteCalendarEvent } from "~/permissions";
import { databaseTimestampToDate } from "~/utils/dates";
import { errorToastIfFalsy, notFoundIfFalsy } from "~/utils/remix.server";
import { CALENDAR_PAGE } from "~/utils/urls";
import { actualNumber, id } from "~/utils/zod";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUserId(request);
	const parsedParams = z
		.object({ id: z.preprocess(actualNumber, id) })
		.parse(params);
	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: parsedParams.id }),
	);

	if (event.tournamentId) {
		errorToastIfFalsy(
			tournamentManagerData(event.tournamentId).stage.length === 0,
			"Tournament has already started",
		);
	} else {
		errorToastIfFalsy(
			canDeleteCalendarEvent({
				user,
				event,
				startTime: databaseTimestampToDate(event.startTimes[0]),
			}),
			"Cannot delete event",
		);
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
