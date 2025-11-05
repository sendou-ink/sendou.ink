import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";

/**
 * Checks whether a user has permission to access the API.
 * A user has API access if they either have the API_ACCESS role (includes supporters),
 * or are an admin/organizer/streamer of an established tournament organization.
 *
 * @param user - The authenticated user to check permissions for
 * @returns True if the user has API access, false otherwise
 */
export async function checkUserHasApiAccess(user: AuthenticatedUser) {
	// NOTE: permissions logic also exists in ApiRepository.allApiTokens function
	if (user.roles.includes("API_ACCESS")) {
		return true;
	}

	const orgs = await TournamentOrganizationRepository.findByUserId(user.id, {
		roles: ["ADMIN", "ORGANIZER", "STREAMER"],
	});

	return orgs.some((org) => org.isEstablished);
}
