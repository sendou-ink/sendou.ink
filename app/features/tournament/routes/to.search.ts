import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { tournamentSearchSearchParams } from "../tournament-search-params";

export type TournamentSearchLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = getUser();
	if (!user) {
		return [];
	}

	const {
		q: query,
		limit,
		minStartTime,
		maxStartTime,
	} = tournamentSearchSearchParams.parse(request);

	if (!query) return [];

	return {
		tournaments: await TournamentRepository.searchByName({
			query,
			limit,
			minStartTime: minStartTime ?? undefined,
			maxStartTime: maxStartTime ?? undefined,
		}),
		query,
	};
};
