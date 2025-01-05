import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentIdFromParams } from "~/features/tournament/tournament-utils";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { tournamentFromDB } from "../core/Tournament.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const tournamentId = tournamentIdFromParams(params);

	const tournament = await tournamentFromDB({ tournamentId, user });

	notFoundIfFalsy(tournament.isLeagueSignup);

	const divisions =
		await TournamentRepository.findChildTournaments(tournamentId);
	notFoundIfFalsy(divisions.length);

	return {
		divisions,
	};
};
