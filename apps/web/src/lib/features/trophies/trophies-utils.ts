import type { Role } from "#lib/modules/permissions/types.ts";

const TROPHIES_RELEASED = false;

/** Whether the user can access the trophies pages while the feature is unreleased. */
export function canAccessTrophies(user?: { roles: Array<Role> } | null) {
	if (TROPHIES_RELEASED) return true;
	if (!user) return false;

	return user.roles.includes("ADMIN") || user.roles.includes("QA");
}
