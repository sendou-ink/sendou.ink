import type { LoaderFunctionArgs } from "react-router";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { tournamentJoinSearchParams } from "../tournament-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const { code: inviteCode } = tournamentJoinSearchParams.parse(url);

	const team = inviteCode
		? await TournamentTeamRepository.findByInviteCode(inviteCode)
		: null;

	return {
		teamId: team?.id ?? null,
		inviteCode,
	};
};
