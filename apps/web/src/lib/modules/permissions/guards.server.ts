import { error } from "@sveltejs/kit";
import { getUser, requireUser } from "#lib/features/auth/user.server.ts";
import type { EntityWithPermissions, Role } from "./types.ts";
import { hasPermission } from "./utils.ts";

/** Responds with 403 unless the logged in user has the given role. */
export function requireRole(role: Role) {
	const user = getUser();

	if (!user?.roles.includes(role)) {
		error(403, "Forbidden");
	}
}

/** Responds with 403 unless the logged in user has the given permission on the entity. */
export function requirePermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K) {
	const user = requireUser();

	if (hasPermission(obj, permission, user)) {
		return;
	}

	error(403, "Forbidden");
}
