import type { LoaderFunctionArgs } from "react-router";
import { tournamentTeamsFullCached } from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const teams = await tournamentTeamsFullCached({ tournamentId });

	return {
		// only what the standings table renders, keyed by tournament team id
		rosters: Object.fromEntries(
			teams.map((team) => [
				team.id,
				team.members.map((member) => ({
					userId: member.userId,
					username: member.username,
					country: member.country,
				})),
			]),
		),
	};
};
