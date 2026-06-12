import type { LoaderFunctionArgs } from "react-router";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const inviteCode = url.searchParams.get("code");

	const team = inviteCode
		? await TournamentTeamRepository.findByInviteCode(inviteCode)
		: null;

	return {
		teamId: team?.id ?? null,
		inviteCode,
	};
};
