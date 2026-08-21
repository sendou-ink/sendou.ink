import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { coerceNumber, id } from "~/utils/schema";
import type { GetTournamentBracketResponse } from "../schema";

const paramsSchema = v.object({
	id,
	bidx: v.pipe(coerceNumber(), v.integer()),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id, bidx } = parseParams({ params, schema: paramsSchema });

	const tournament = await tournamentFromDB(id);

	const bracket = notFoundIfNullish(tournament.bracketByIdx(bidx));

	const result: GetTournamentBracketResponse = {
		data: bracket.data,
		teams: teams(bracket),
		meta: {
			teamsPerGroup:
				bracket.type === "round_robin"
					? (bracket.settings?.teamsPerGroup ??
						tournament.ctx.settings.teamsPerGroup)
					: undefined,
			groupCount:
				bracket.type === "swiss"
					? (bracket.settings?.groupCount ??
						tournament.ctx.settings.swiss?.groupCount)
					: undefined,
			roundCount:
				bracket.type === "swiss"
					? (bracket.settings?.roundCount ??
						tournament.ctx.settings.swiss?.roundCount)
					: undefined,
		},
	};

	return Response.json(result);
};

function teams(bracket: Bracket) {
	const checkedIn = bracket.seeding ?? bracket.participantTournamentTeamIds;
	const pending = bracket.teamsPendingCheckIn ?? [];

	return checkedIn
		.map((teamId) => ({
			id: teamId,
			checkedIn: true,
		}))
		.concat(
			pending.map((teamId) => ({
				id: teamId,
				checkedIn: false,
			})),
		);
}
