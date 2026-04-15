import { type LoaderFunctionArgs, redirect } from "react-router";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import { parseParams } from "~/utils/remix.server";
import {
	tournamentBracketsPage,
	tournamentRegisterPage,
	tournamentResultsPage,
} from "~/utils/urls";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentFromDBCached({
		tournamentId,
		user: undefined,
	});

	if (!tournament.hasStarted) {
		return redirect(tournamentRegisterPage(tournamentId));
	}

	if (!tournament.ctx.isFinalized) {
		return redirect(tournamentBracketsPage({ tournamentId }));
	}

	return redirect(tournamentResultsPage(tournamentId));
};
