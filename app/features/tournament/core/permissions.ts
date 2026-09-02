import * as R from "remeda";
import type { TournamentStaffRole } from "~/features/tournament/tournament-constants";
import type { TournamentOrganizationRole } from "~/features/tournament-organization/tournament-organization-constants";

/**
 * The half of a tournament's permissions (docs/dev/permissions.md) depending only on author,
 * organization members and staff, for callers not loading the whole tournament. `ADMIN`: full
 * control, `ORGANIZE`: running it, `MANAGE_MATCHES`: casting, locking and admining matches.
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
