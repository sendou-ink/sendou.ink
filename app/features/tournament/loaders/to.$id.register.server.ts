import type { LoaderFunctionArgs } from "react-router";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import {
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);
	if (!user) return null;

	const teamMemberOf = tournament.teamMemberOfByUser(user);

	if (!teamMemberOf) {
		return {
			ownTeam: null,
			mapPool: null,
			friendPlayers: null,
			teams: await TeamRepository.findAllMemberOfByUserId(user.id),
			isSaved: await SavedCalendarEventRepository.isSaved({
				userId: user.id,
				tournamentId,
			}),
		};
	}

	const ownTeam =
		(await tournamentTeamsFullCached({ tournamentId, user })).find(
			(team) => team.id === teamMemberOf.id,
		) ?? null;

	return {
		ownTeam,
		mapPool: ownTeam?.mapPool ?? null,
		friendPlayers: await SQGroupRepository.findFriendsAndTeammates(user.id),
		teams: await TeamRepository.findAllMemberOfByUserId(user.id),
		isSaved: false,
	};
};

export type TournamentRegisterPageLoader = typeof loader;
