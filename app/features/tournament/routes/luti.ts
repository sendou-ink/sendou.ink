import { redirect } from "react-router";
import { notFoundIfFalsy } from "../../../utils/remix.server";
import { tournamentPage } from "../../../utils/urls";
import { LEAGUES } from "../tournament-constants";

const maybeLatest = LEAGUES.LUTI?.at(-1);

export const loader = () => {
	const latest = notFoundIfFalsy(maybeLatest);

	return redirect(tournamentPage(latest.tournamentId));
};
