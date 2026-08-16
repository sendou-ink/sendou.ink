import { tournamentBracketsSearchParams } from "./tournament-bracket-search-params";

export const tournamentBracketsPage = ({
	tournamentId,
	bracketIdx,
	groupId,
}: {
	tournamentId: number;
	bracketIdx?: number | null;
	groupId?: number;
}) =>
	tournamentBracketsSearchParams.href(`/to/${tournamentId}/brackets`, {
		idx: bracketIdx ?? null,
		group: groupId ?? null,
	});
