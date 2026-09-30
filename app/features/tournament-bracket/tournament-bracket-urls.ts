import { tournamentBracketsSearchParams } from "./tournament-bracket-search-params";

export const tournamentBracketsPage = ({
	tournamentId,
	bracketIdx,
	groupId,
	divisionIdx,
}: {
	tournamentId: number;
	bracketIdx?: number | null;
	groupId?: number;
	divisionIdx?: number | null;
}) =>
	tournamentBracketsSearchParams.href(`/to/${tournamentId}/brackets`, {
		idx: bracketIdx ?? null,
		group: groupId ?? null,
		division: divisionIdx ?? null,
	});
