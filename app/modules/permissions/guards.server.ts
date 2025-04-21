import type { EntityWithPermissions } from "~/modules/permissions/types";
import { isAdmin } from "~/permissions";

// TODO: could avoid passing user in after remix middlewares land with async context

/**
 * Checks if a user has the required permission to perform an action on a given entity.
 *
 * @throws {Response} - Throws a 403 Forbidden response if the user does not have the required permission.
 */
export function requirePermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K, user: { id: number }) {
	// admin can do anything in production but not in development for better testing
	if (process.env.NODE_ENV === "production" && isAdmin(user)) {
		return;
	}

	const permissions = obj.permissions as Record<K, number[]>;

	if (permissions[permission].includes(user.id)) {
		return;
	}

	throw new Response("Forbidden", { status: 403 });
}
