import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTournamentBracketResponse } from "../schema";

const paramsSchema = z.object({
	id,
	bidx: z.coerce.number().int(),
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { id, bidx } = parseParams({ params, schema: paramsSchema });

	const tournament = await tournamentFromDB({
		user: undefined,
		tournamentId: id,
	});

	const bracket = notFoundIfFalsy(tournament.bracketByIdx(bidx));

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

	return await cors(request, json(result));
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
