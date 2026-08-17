import { error } from "@sveltejs/kit";

/**
 * Rejects the remote function with a user-readable message.
 *
 * xxx: surface these as error toasts on the client (toast infra arrives with
 * the layout polish) — for now callers see the failed mutation's message.
 */
export function errorToast(message: string): never {
	error(400, message);
}

/** Like `errorToast` but only when the condition is falsy. */
export function errorToastIfFalsy(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) {
		errorToast(message);
	}
}

/** Responds with 404 when the value is null/undefined, narrowing it otherwise. */
export function notFoundIfNullish<T>(value: T): NonNullable<T> {
	if (value === null || value === undefined) {
		error(404, "Not found");
	}

	return value;
}
