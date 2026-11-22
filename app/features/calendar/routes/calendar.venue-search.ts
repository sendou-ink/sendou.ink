import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentSharedCached } from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { venueSearchSearchParams } from "../calendar-search-params";
import * as VenueSearch from "../core/VenueSearch.server";
import { findValidOrganizations } from "../loaders/calendar.new.server";

export type VenueSearchLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { q: query, tournamentId } = venueSearchSearchParams.parse(request);

	const canSearch =
		user.roles.includes("TOURNAMENT_ADDER") ||
		user.roles.includes("CALENDAR_EVENT_ADDER") ||
		(await findValidOrganizations(user.id, false)).length > 0 ||
		(tournamentId !== null &&
			(await tournamentSharedCached(tournamentId)).canEditEventInfo(user));

	if (!canSearch) {
		return { results: [], isUnavailable: false, query };
	}

	const results = await VenueSearch.search({ query, userId: user.id });

	return { results: results ?? [], isUnavailable: results === null, query };
};
