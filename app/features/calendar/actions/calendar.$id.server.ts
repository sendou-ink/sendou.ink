import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
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

	requirePermission(event, "DELETE");

	if (event.tournamentId) {
		errorToastIfFalsy(
			(await BracketRepository.findByTournamentId(event.tournamentId)).stage
				.length === 0,
			"Tournament has already started",
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
