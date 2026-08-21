import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import {
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";

export type TournamentAdminRegistrationLoaderData = SerializeFrom<
	typeof loader
>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tid: tournamentTeamId } = parseParams({
		params,
		schema: v.object({ tid: v.optional(id) }),
	});

	const { tournamentId, user } = await tournamentFromParams(params, {
		for: "organizer",
	});

	if (typeof tournamentTeamId !== "number") return { team: null };

	const team =
		(await tournamentTeamsFullCached({ tournamentId, user })).find(
			(t) => t.id === tournamentTeamId,
		) ?? null;

	return { team };
};
