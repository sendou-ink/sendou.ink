import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	requireTournamentVisible,
	tournamentDataCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { badRequestIfFalsy } from "~/utils/remix.server";
import { tournamentImportTeamsSearchParams } from "../tournament-admin-search-params";

export type ImportTeamsLoaderData = SerializeFrom<typeof loader>;

/**
 * Returns the teams (with rosters) of another tournament so an organizer can
 * import one into the registration form they are filling out.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();

	const fromTournamentId = badRequestIfFalsy(
		tournamentImportTeamsSearchParams.parse(request).fromTournamentId,
	);

	const { ctx } = await tournamentDataCached({
		tournamentId: fromTournamentId,
	});
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
				isOwner: member.role === "OWNER",
			})),
		})),
	};
};
