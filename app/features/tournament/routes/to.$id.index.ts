import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { parseParams } from "~/utils/remix.server";
import {
	tournamentBracketsPage,
	tournamentRegisterPage,
	tournamentResultsPage,
} from "~/utils/urls";
import { idObject } from "~/utils/zod";
import hasTournamentFinalized from "../queries/hasTournamentFinalized.server";
import hasTournamentStarted from "../queries/hasTournamentStarted.server";

export const loader = ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	if (!hasTournamentStarted(tournamentId)) {
		return redirect(tournamentRegisterPage(tournamentId));
	}

	if (!hasTournamentFinalized(tournamentId)) {
		return redirect(tournamentBracketsPage({ tournamentId }));
	}

	return redirect(tournamentResultsPage(tournamentId));
};
