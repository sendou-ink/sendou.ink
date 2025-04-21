import { useUser } from "~/features/auth/core/user";
import type { EntityWithPermissions } from "~/modules/permissions/types";
import { isAdmin } from "~/permissions";

/**
 * Determines whether a user has a specific permission for a given entity.
 *
 * @returns A boolean indicating whether the user has the specified permission.
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
