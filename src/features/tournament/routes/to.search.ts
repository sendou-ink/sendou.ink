import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseSearchParams } from "~/utils/remix.server";
import { tournamentSearchSearchParamsSchema } from "../tournament-schemas.server";

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
