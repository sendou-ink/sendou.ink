import { requireUser } from "~/features/auth/core/user.server";
import type { EntityWithPermissions, Role } from "~/modules/permissions/types";
import { forbidden } from "~/utils/remix.server";
import { hasPermission } from "./utils";

/** @throws {Response} 403 if the user lacks the global role. */
export function requireRole(role: Role) {
	const user = requireUser();
	if (!user.roles.includes(role)) {
		forbidden();
	}
}

/** @throws {Response} 403 if the user lacks the permission on the entity. */
export function requirePermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K) {
	const user = requireUser();

	if (hasPermission(obj, permission, user)) {
		return;
	}

	forbidden();
}
