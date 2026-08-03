import { type LoaderFunctionArgs, redirect } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import {
	tournamentFromDBCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
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

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	if (!tournament.isOrganizer(user)) {
		throw redirect(tournamentPage(tournamentId));
	}

	if (typeof tournamentTeamId !== "number") return { team: null };

	const team =
		(await tournamentTeamsFullCached({ tournamentId, user })).find(
			(t) => t.id === tournamentTeamId,
		) ?? null;

	return { team };
};
