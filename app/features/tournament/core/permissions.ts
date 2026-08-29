import * as R from "remeda";
import type { TournamentStaffRole } from "~/features/tournament/tournament-constants";
import type { TournamentOrganizationRole } from "~/features/tournament-organization/tournament-organization-constants";

/**
 * Who may run the tournament, following the convention in docs/dev/permissions.md.
 * The half of a tournament's permissions that only depends on the author, the
 * organization's members and the staff, shared with callers that resolve those
 * rows without loading the whole tournament.
 *
 * - `ADMIN`: full control of the tournament
 * - `ORGANIZE`: running the tournament
 * - `MANAGE_MATCHES`: casting, locking and admining individual matches
 */
export function organizerPermissions(args: {
	authorId: number;
	organizationMembers: Array<{
		userId: number;
		role: TournamentOrganizationRole;
	}>;
	staff: Array<{ userId: number; role: TournamentStaffRole }>;
}) {
	const membersWithRole = (roles: Array<TournamentOrganizationRole>) =>
		args.organizationMembers
			.filter((member) => roles.includes(member.role))
			.map((member) => member.userId);
	const staffWithRole = (roles: Array<TournamentStaffRole>) =>
		args.staff
			.filter((staff) => roles.includes(staff.role))
			.map((staff) => staff.userId);

	const ADMIN = R.unique([args.authorId, ...membersWithRole(["ADMIN"])]);
	const ORGANIZE = R.unique([
		...ADMIN,
		...membersWithRole(["ORGANIZER"]),
		...staffWithRole(["ORGANIZER"]),
	]);
	const MANAGE_MATCHES = R.unique([
		...ORGANIZE,
		...membersWithRole(["STREAMER"]),
		...staffWithRole(["STREAMER"]),
	]);

	return { ADMIN, ORGANIZE, MANAGE_MATCHES };
}
