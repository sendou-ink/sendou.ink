import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";

/** Whether the user may access the API: the API_ACCESSER role (includes supporters), or admin/organizer/streamer of an established tournament organization. */
export async function checkUserHasApiAccess(user: AuthenticatedUser) {
	// NOTE: permissions logic also exists in ApiRepository.findAllApiTokens function
	if (user.roles.includes("API_ACCESSER")) {
		return true;
	}

	const orgs = await TournamentOrganizationRepository.findByUserId(user.id, {
		roles: ["ADMIN", "ORGANIZER", "STREAMER"],
	});

	return orgs.some((org) => org.isEstablished);
}
