import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { errorToastIfFalsy } from "~/utils/remix.server";

/** Throws an error toast unless the user is an organizer of the tournament. */
export function requireTournamentOrganizer(
	tournament: Tournament,
	user: AuthenticatedUser,
) {
	errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");
}

/** Throws an error toast unless the user is an admin of the tournament. */
export function requireTournamentAdmin(
	tournament: Tournament,
	user: AuthenticatedUser,
) {
	errorToastIfFalsy(tournament.isAdmin(user), "Unauthorized");
}
