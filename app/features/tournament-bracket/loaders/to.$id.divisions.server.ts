import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentIdFromParams } from "~/features/tournament/tournament-utils";
import { notFoundIfFalsy } from "~/utils/remix.server";
import type { Unwrapped } from "../../../utils/types";
import { tournamentFromDB } from "../core/Tournament.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const tournamentId = tournamentIdFromParams(params);

	const divisions = notFoundIfFalsy(await divisionsCached(tournamentId));

	return {
		divisions,
		divsParticipantOf: user
			? divisions
					.filter((division) => division.participantUserIds.has(user?.id))
					.map((division) => division.tournamentId)
			: [],
	};
};

// no purge mechanism in code but new divisions are created so rarely we just reboot the server when it is done
const tournamentDivisionsCache = new Map<
	number,
	Array<Unwrapped<typeof TournamentRepository.findChildTournaments>>
>();

async function divisionsCached(tournamentId: number) {
	if (!tournamentDivisionsCache.has(tournamentId)) {
		const tournament = await tournamentFromDB({
			tournamentId,
			user: undefined,
		});

		if (!tournament.isLeagueSignup) {
			return null;
		}

		tournamentDivisionsCache.set(
			tournamentId,
			await TournamentRepository.findChildTournaments(tournamentId),
		);
	}

	return tournamentDivisionsCache.get(tournamentId)!;
}
