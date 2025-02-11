import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { findMapPoolByTeamId } from "~/features/tournament-bracket/queries/findMapPoolByTeamId.server";
import { findOwnTournamentTeam } from "../queries/findOwnTournamentTeam.server";
import { tournamentIdFromParams } from "../tournament-utils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	if (!user) return null;

	const ownTournamentTeam = findOwnTournamentTeam({
		tournamentId: tournamentIdFromParams(params),
		userId: user.id,
	});
	if (!ownTournamentTeam)
		return {
			mapPool: null,
			trusterPlayers: null,
			teams: await TeamRepository.findAllMemberOfByUserId(user.id),
		};

	return {
		mapPool: findMapPoolByTeamId(ownTournamentTeam.id),
		trusterPlayers: await QRepository.usersThatTrusted(user.id),
		teams: await TeamRepository.findAllMemberOfByUserId(user.id),
	};
};

export type TournamentRegisterPageLoader = typeof loader;
