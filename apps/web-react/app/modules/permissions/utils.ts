import {
	ADMIN_ID,
	DEV_IDS,
	QA_IDS,
	SCANNER_TESTER_IDS,
	STAFF_IDS,
} from "~/features/admin/admin-constants";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import type { EntityWithPermissions } from "./types";

/**
 * Determines whether a user has a specific permission for a given entity.
 * Single source of truth shared by `requirePermission` and `useHasPermission`.
 *
 * @returns A boolean indicating whether the user has the specified permission. Always false if user is not logged in.
 */
export function hasPermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K, user?: { id: number } | null) {
	if (!user) return false;

	// admin can do anything in production but not in development or e2e tests for better testing
	if (
		process.env.NODE_ENV === "production" &&
		!IS_E2E_TEST_RUN &&
		isAdmin(user)
	) {
		return true;
	}

	return (obj.permissions as Record<K, number[]>)[permission].includes(user.id);
}

export function isAdmin(user?: { id: number }) {
	return user?.id === ADMIN_ID;
}

export function isStaff(user?: { id: number }) {
	if (!user) return false;

	return STAFF_IDS.includes(user.id);
}

export function isDev(user?: { id: number }) {
	if (!user) return false;

	return DEV_IDS.includes(user.id);
}

export function isQa(user?: { id: number }) {
	if (!user) return false;

	return QA_IDS.includes(user.id);
}

export function isScannerTester(user?: { id: number }) {
	if (!user) return false;

	return SCANNER_TESTER_IDS.includes(user.id);
}

export function isSupporter(user?: { patronTier: number | null }) {
	return typeof user?.patronTier === "number" && user.patronTier >= 2;
}
