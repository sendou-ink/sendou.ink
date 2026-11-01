import type { Role } from "~/modules/permissions/types";

/** The feed is in testing: devs and the admin can make it their front page and view anyone's feed */
export function isFeedTester(user: { roles: Role[] } | null | undefined) {
	return Boolean(
		user && (user.roles.includes("DEV") || user.roles.includes("ADMIN")),
	);
}
