import { type LoaderFunctionArgs, redirect } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import { tournamentInfoPage, tournamentResultsPage } from "~/utils/urls";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});

	if (!tournament.hasStarted) {
		return redirect(tournamentInfoPage(tournamentId));
	}

	if (!tournament.ctx.isFinalized) {
		return redirect(tournamentBracketsPage({ tournamentId }));
	}

	return redirect(tournamentResultsPage(tournamentId));
};
