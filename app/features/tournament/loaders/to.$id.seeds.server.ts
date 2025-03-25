import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/utils/urls";
import { tournamentIdFromParams } from "../tournament-utils";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	if (!tournament.isOrganizer(user) || tournament.hasStarted) {
		throw redirect(tournamentBracketsPage({ tournamentId }));
	}

	return null;
};
