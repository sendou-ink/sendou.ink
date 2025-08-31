import { requireUser } from '$lib/server/auth/session';
import { error } from '@sveltejs/kit';
import type { EntityWithPermissions, Role } from './types';
import { isAdmin } from './utils';

/**
 * Checks if a user has the required global role.
 *
 * @throws {Response} - Throws a 403 Forbidden response if the user does not have the required role.
 */
export async function requireRole(role: Role) {
	const user = await requireUser();
	if (!user.roles.includes(role)) error(403);
}

/**
 * Checks if a user has the required permission to perform an action on a given entity.
 *
 * @throws {Response} - Throws a 403 Forbidden response if the user does not have the required permission.
 */
export async function requirePermission<
	T extends EntityWithPermissions,
	K extends keyof T['permissions']
>(obj: T, permission: K) {
	const user = await requireUser();

	// admin can do anything in production but not in development for better testing
	// if (process.env.NODE_ENV === 'production' && isAdmin(user)) {
	// 	return;
	// } xxx: return condition

	if (isAdmin(user)) {
		return;
	}

	const permissions = obj.permissions as Record<K, number[]>;

	if (permissions[permission].includes(user.id)) {
		return;
	}

	error(403);
}
