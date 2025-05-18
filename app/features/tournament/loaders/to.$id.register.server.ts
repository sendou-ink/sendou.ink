import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { findMapPoolByTeamId } from "~/features/tournament-bracket/queries/findMapPoolByTeamId.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { findOwnTournamentTeam } from "../queries/findOwnTournamentTeam.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	if (!user) return null;

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const ownTournamentTeam = findOwnTournamentTeam({
		tournamentId,
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
