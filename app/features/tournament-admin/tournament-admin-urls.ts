import { tournamentAdminPage } from "~/utils/urls";
import { tournamentImportTeamsSearchParams } from "./tournament-admin-search-params";

export const tournamentAdminImportTeamsPage = ({
	tournamentId,
	fromTournamentId,
}: {
	tournamentId: number;
	fromTournamentId: number;
}) =>
	tournamentImportTeamsSearchParams.href(
		`${tournamentAdminPage(tournamentId)}/import-teams`,
		{ fromTournamentId },
	);
