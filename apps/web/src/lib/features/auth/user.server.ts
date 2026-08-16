import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import type { AuthenticatedUser } from "./user-types.ts";

export type { AuthenticatedUser };

/** The logged in user of the current request, or `undefined` when logged out. */
export function getUser(): AuthenticatedUser | undefined {
	return getRequestEvent().locals.user;
}

/** The logged in user of the current request; responds with 401 when logged out. */
export function requireUser(): AuthenticatedUser {
	const user = getUser();
	if (!user) {
		error(401);
	}

	return user;
}

/** Id of the acting user; throws when logged out (use only where auth was already established). */
export function actorId(): number {
	const user = getUser();
	if (!user) {
		throw new Error("No acting user in context");
	}

	return user.id;
}

/** Id of the acting user, or `null` when logged out. */
export function actorIdOrNull(): number | null {
	return getUser()?.id ?? null;
}
