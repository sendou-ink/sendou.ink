import { useUser } from "~/features/auth/core/user";
import type { EntityWithPermissions, Role } from "~/modules/permissions/types";
import { isAdmin } from "./utils";

/**
 * Determines whether a user has a specific global role.
 *
 * @returns A boolean indicating whether the user has the specified role. Always false if user is not logged in.
 */
export function useHasRole(role: Role) {
	const user = useUser();

	if (!user) return false;

	return user.roles.includes(role);
}

/**
 * Determines whether a user has a specific permission for a given entity.
 *
 * @returns A boolean indicating whether the user has the specified permission. Always false if user is not logged in.
 */
export function useHasPermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K) {
	const user = useUser();

	if (!user) return false;

	// admin can do anything in production but not in development for better testing
	if (process.env.NODE_ENV === "production" && isAdmin(user)) {
		return true;
	}

	return (obj.permissions as Record<K, number[]>)[permission].includes(user.id);
}
