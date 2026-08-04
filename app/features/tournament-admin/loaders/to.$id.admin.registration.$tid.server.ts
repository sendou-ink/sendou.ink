import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import {
	requireTournamentOrganizer,
	tournamentSharedCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";

export type TournamentAdminRegistrationLoaderData = SerializeFrom<
	typeof loader
>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId, tid: tournamentTeamId } = parseParams({
		params,
		schema: z.object({ id, tid: id.optional() }),
	});

	const tournament = await tournamentSharedCached(tournamentId);
	requireTournamentOrganizer({ tournament, user });

	if (typeof tournamentTeamId !== "number") return { team: null };

	const team =
		(await tournamentTeamsFullCached({ tournamentId, user })).find(
			(t) => t.id === tournamentTeamId,
		) ?? null;

	return { team };
};
