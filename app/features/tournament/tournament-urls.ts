import { tournamentJoinSearchParams } from "./tournament-search-params";

export const tournamentJoinPage = ({
	tournamentId,
	inviteCode,
}: {
	tournamentId: number;
	inviteCode: string;
}) =>
	tournamentJoinSearchParams.href(`/to/${tournamentId}/join`, {
		code: inviteCode,
	});
