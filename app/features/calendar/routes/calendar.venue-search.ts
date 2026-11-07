import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import { venueSearchSearchParams } from "../calendar-search-params";
import * as VenueSearch from "../core/VenueSearch.server";
import { findValidOrganizations } from "../loaders/calendar.new.server";

export type VenueSearchLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const canAddTournaments =
		user.roles.includes("TOURNAMENT_ADDER") ||
		(await findValidOrganizations(user.id, false)).length > 0;
	const { q: query } = venueSearchSearchParams.parse(request);

	if (!canAddTournaments) return { results: [], query };

	return {
		results: await VenueSearch.search({ query, userId: user.id }),
		query,
	};
};
