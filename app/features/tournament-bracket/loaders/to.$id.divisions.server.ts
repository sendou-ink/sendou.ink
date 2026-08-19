import { type LoaderFunctionArgs, redirect } from "react-router";
import { tournamentBracketsPage } from "~/utils/urls";
import { tournamentFromParams } from "../core/Tournament.server";

// xxx: clientside redirection is ok
/**
 * The view renders the divisions from the layout's data alone, this only keeps tournaments
 * that have no divisions off the page.
 */
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament } = await tournamentFromParams(params, { for: "view" });

	if (!tournament.isLeague) {
		throw redirect(tournamentBracketsPage({ tournamentId: tournament.ctx.id }));
	}

	return null;
};
