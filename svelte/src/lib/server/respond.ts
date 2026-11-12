import { error } from "@sveltejs/kit";
import type { EntityWithPermissions } from "~/modules/permissions/types";
import { hasPermission } from "~/modules/permissions/utils";
import { requireUser } from "./shims/user.server.ts";

/** Asserts the value is truthy, fails the request with a 400 otherwise. */
export function badRequestIfFalsy<T>(value: T | null | undefined): T {
	if (!value) error(400, "Bad Request");

	return value;
}

/** Asserts the condition is truthy; otherwise fails the request with `message`, which the submitting form shows as an error toast. */
export function errorToastIfFalsy(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) error(400, message);
}

/** Fails the request with a 403 if the user lacks the permission on the entity. */
export function requirePermission<
	T extends EntityWithPermissions,
	K extends keyof T["permissions"],
>(obj: T, permission: K) {
	if (!hasPermission(obj, permission, requireUser())) {
		error(403, "Forbidden");
	}
}
