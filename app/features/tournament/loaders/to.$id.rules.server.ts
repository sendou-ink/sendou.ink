import type { LoaderFunctionArgs } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId } = await tournamentFromParams(params, { for: "view" });

	return {
		rules: await TournamentRepository.findRulesById(tournamentId),
	};
};
