import { IMPERSONATED_SESSION_KEY, SESSION_KEY } from "./authenticator.server";
import { authSessionStorage } from "./session.server";
import {
	type AuthenticatedUser,
	getUserContext,
	userAsyncLocalStorage,
} from "./user-context.server";

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
	return userAsyncLocalStorage.getStore()?.user?.id ?? null;
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
