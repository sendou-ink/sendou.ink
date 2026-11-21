import type { LoaderFunctionArgs } from "react-router";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	requireTournamentVisible,
	type TournamentTeamFull,
	tournamentDataCached,
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { badRequestIfFalsy } from "~/utils/remix.server";
import { tournamentImportTeamsSearchParams } from "../tournament-admin-search-params";

export type ImportTeamsLoaderData = SerializeFrom<typeof loader>;

/** Teams (with rosters) of another tournament for importing into the registration form. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "organizer",
	});

	const fromTournamentId = badRequestIfFalsy(
		tournamentImportTeamsSearchParams.parse(request).fromTournamentId,
	);

	const { ctx } = await tournamentDataCached(fromTournamentId);
	requireTournamentVisible({ ctx, user });

	const fromTournamentTeams = await tournamentTeamsFullCached({
		tournamentId: fromTournamentId,
		user,
	});

	return {
		teams: fromTournamentTeams.map((team) => ({
			id: team.id,
			name: team.name,
			avatarImgId: team.avatarImgId,
			pickupAvatarUrl: team.pickupAvatarUrl,
			linkedTeam: team.team
				? { id: team.team.id, logoUrl: team.team.logoUrl }
				: null,
			members: team.members.map((member) => ({
				userId: member.userId,
				username: member.username,
				inGameName: member.inGameName,
				tournamentName: member.tournamentName,
				isOwner: member.role === "OWNER",
				isPlaceholder: Boolean(member.isPlaceholder),
			})),
			mapPool: importableMapPool(team.mapPool, tournament),
		})),
	};
};

/** The team's picks if they are a complete, legal map pool in the tournament being registered to. */
function importableMapPool(
	mapPool: TournamentTeamFull["mapPool"],
	tournament: Tournament,
) {
	const teamPick = tournament.teamPickSettings;
	if (!mapPool || !teamPick) return null;

	const status = TeamPick.validateTeamPool({
		mapPool: new MapPool(mapPool),
		teamPick,
		pool: tournament.mapPool,
	});

	return status === "VALID" ? mapPool : null;
}
