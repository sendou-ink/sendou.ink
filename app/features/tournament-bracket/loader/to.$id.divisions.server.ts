import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentIdFromParams } from "~/features/tournament/tournament-utils";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { tournamentFromDB } from "../core/Tournament.server";

// xxx: handle "is playing in div"
// xxx: cache?

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
		divsParticipantOf: user
			? divisions
					.filter((division) => division.participantUserIds.has(user?.id))
					.map((division) => division.tournamentId)
			: [],
	};
};
