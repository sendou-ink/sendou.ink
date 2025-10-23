import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { parseSearchParams } from "~/utils/remix.server";
import { tournamentSearchSearchParamsSchema } from "../tournament-schemas.server";

export type TournamentSearchLoaderData = SerializeFrom<typeof loader>;

// xxx: param to also search for calendar events
export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	if (!user) {
		return [];
	}

	const {
		q: query,
		limit,
		minStartTime,
	} = parseSearchParams({
		request,
		schema: tournamentSearchSearchParamsSchema,
	});

	if (!query) return [];

	return {
		tournaments: await TournamentRepository.searchByName({
			query,
			limit,
			minStartTime,
		}),
		query,
	};
};
