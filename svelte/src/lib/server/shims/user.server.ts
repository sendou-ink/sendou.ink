// Stands in for the React app's `~/features/auth/core/user.server` (see vite.config.ts) so the
// shared repositories resolve the acting user from the SvelteKit request event.
import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import type * as UserRepository from "~/features/user-page/UserRepository.server";

export type AuthenticatedUser = NonNullable<
	Awaited<ReturnType<typeof UserRepository.findLeanById>>
>;

export function getUser(): AuthenticatedUser | undefined {
	return getRequestEvent().locals.user;
}

export function requireUser(): AuthenticatedUser {
	const user = getUser();

	if (!user) error(401, "Unauthorized");

	return user;
}

/** Throws without an authenticated user: a bouncer should have enforced auth, so absence is a bug, not a 401. */
export function actorId(): number {
	const id = actorIdOrNull();
	if (id === null) throw new Error("No acting user in context");
	return id;
}

/** For reads that also serve anonymous visitors, where the actor only scopes the result. */
export function actorIdOrNull(): number | null {
	return getUser()?.id ?? null;
}

/** Null also when there is no request context at all (e.g. cron routines); never throws. */
export function actorIdOrNullSafe(): number | null {
	try {
		return actorIdOrNull();
	} catch {
		return null;
	}
}
