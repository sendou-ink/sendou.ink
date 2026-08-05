import type { LoaderFunctionArgs } from "react-router";
import {
	tournamentFromParams,
	tournamentTeamsFullInSeedOrder,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";

export type TournamentAdminTeamsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "organizer",
	});

	return {
		teams: await tournamentTeamsFullInSeedOrder({ tournament, user }),
	};
};
