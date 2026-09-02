import { useUser } from "~/features/auth/core/user";
import type { EntityWithPermissions, Role } from "~/modules/permissions/types";
import { hasPermission } from "./utils";

/** Whether the logged in user has the global role; false when logged out. */
export function useHasRole(role: Role) {
	const user = useUser();

	if (!user) return false;

	return user.roles.includes(role);
}

/** Whether the logged in user has the permission on the entity; false when logged out. */
export function useHasPermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K) {
	const user = useUser();

	return hasPermission(obj, permission, user);
}
