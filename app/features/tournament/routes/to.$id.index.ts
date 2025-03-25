import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import {
	tournamentBracketsPage,
	tournamentRegisterPage,
	tournamentResultsPage,
} from "~/utils/urls";
import hasTournamentFinalized from "../queries/hasTournamentFinalized.server";
import hasTournamentStarted from "../queries/hasTournamentStarted.server";
import { tournamentIdFromParams } from "../tournament-utils";

export const loader = ({ params }: LoaderFunctionArgs) => {
	const tournamentId = tournamentIdFromParams(params);

	if (!hasTournamentStarted(tournamentId)) {
		return redirect(tournamentRegisterPage(tournamentId));
	}

	if (!hasTournamentFinalized(tournamentId)) {
		return redirect(tournamentBracketsPage({ tournamentId }));
	}

	return redirect(tournamentResultsPage(tournamentId));
};
