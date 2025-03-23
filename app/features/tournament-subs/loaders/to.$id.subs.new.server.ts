import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentIdFromParams } from "~/features/tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentSubsPage } from "~/utils/urls";
import { findSubsByTournamentId } from "../queries/findSubsByTournamentId.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	if (!tournament.canAddNewSubPost) {
		throw redirect(tournamentSubsPage(tournamentId));
	}

	const sub = findSubsByTournamentId({ tournamentId }).find(
		(sub) => sub.userId === user.id,
	);

	return {
		sub,
	};
};
