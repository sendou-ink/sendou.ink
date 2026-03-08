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
