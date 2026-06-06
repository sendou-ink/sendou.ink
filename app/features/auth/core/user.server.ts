import { IMPERSONATED_SESSION_KEY, SESSION_KEY } from "./authenticator.server";
import { authSessionStorage } from "./session.server";
import { type AuthenticatedUser, getUserContext } from "./user-context.server";

export type { AuthenticatedUser };

export function getUser(): AuthenticatedUser | undefined {
	const context = getUserContext();
	return context.user;
}

export function requireUser(): AuthenticatedUser {
	const user = getUser();

	if (!user) throw new Response(null, { status: 401 });

	return user;
}

/** Id of the acting user, from request context. Throws an Error if there is no
 *  authenticated user (e.g. called outside a request) — repositories rely on a
 *  bouncer having already enforced auth, so absence here is a bug, not a 401. */
export function actorId(): number {
	const id = actorIdOrNull();
	if (id === null) throw new Error("No acting user in context");
	return id;
}

/** Id of the acting user, or null when unauthenticated. Use for reads that
 *  also serve anonymous visitors, where the actor only scopes the result. */
export function actorIdOrNull(): number | null {
	return getUser()?.id ?? null;
}

export async function isImpersonating(request: Request) {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	return Boolean(session.get(IMPERSONATED_SESSION_KEY));
}

export async function getRealUserId(
	request: Request,
): Promise<number | undefined> {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	return session.get(SESSION_KEY) as number | undefined;
}
