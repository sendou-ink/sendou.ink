import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	requireTournamentOrganizer,
	tournamentSharedCached,
	tournamentTeamsFullInSeedOrder,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentAdminTeamsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);
	requireTournamentOrganizer({ tournament, user });

	return {
		teams: await tournamentTeamsFullInSeedOrder({ tournament, user }),
	};
};
