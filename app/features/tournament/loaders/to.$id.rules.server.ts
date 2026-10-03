import type { LoaderFunctionArgs } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId } = await tournamentFromParams(params, { for: "view" });

	return {
		rules:
			(await tournamentRules(tournamentId).executeTakeFirst())?.rules ?? null,
	};
};

// visibility checked by tournamentFromParams
function tournamentRules(tournamentId: number) {
	return TournamentRepository.tournaments()
		.where({ id: tournamentId })
		.includingHidden()
		.withColumns(["rules"]);
}
