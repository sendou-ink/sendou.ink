import type { LoaderFunctionArgs } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import type { Unwrapped } from "../../../utils/types";
import {
	tournamentFromDB,
	tournamentFromParams,
} from "../core/Tournament.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId, user } = await tournamentFromParams(params, {
		for: "view",
	});

	const divisions = notFoundIfNullish(await divisionsCached(tournamentId));

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
		const tournament = await tournamentFromDB(tournamentId);

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
