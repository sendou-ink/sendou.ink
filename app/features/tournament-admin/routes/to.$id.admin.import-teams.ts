import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseSearchParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";

export type ImportTeamsLoaderData = SerializeFrom<typeof loader>;

/**
 * Returns the teams (with rosters) of another tournament so an organizer can
 * import one into the registration form they are filling out.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { fromTournamentId } = parseSearchParams({
		request,
		schema: z.object({ fromTournamentId: id }),
	});

	const fromTournament = await tournamentFromDB({
		tournamentId: fromTournamentId,
		user,
	});

	return {
		teams: fromTournament.ctx.teams.map((team) => ({
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
