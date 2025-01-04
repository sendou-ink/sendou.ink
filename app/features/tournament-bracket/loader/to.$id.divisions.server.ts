import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "react-router-dom";
import { getUser } from "~/features/auth/core/user.server";
import { tournamentIdFromParams } from "~/features/tournament/tournament-utils";
import { tournamentPage } from "~/utils/urls";
import { tournamentFromDB } from "../core/Tournament.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const tournamentId = tournamentIdFromParams(params);

	const tournament = await tournamentFromDB({ tournamentId, user });

	if (!tournament.isLeagueSignup) {
		return redirect(tournamentPage(tournamentId));
	}

	return null;
};
