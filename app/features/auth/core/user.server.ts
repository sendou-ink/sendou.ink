import { IMPERSONATED_SESSION_KEY } from "./authenticator.server";
import { authSessionStorage } from "./session.server";
import { type AuthenticatedUser, getUserContext } from "./user-context.server";

export type { AuthenticatedUser };

export async function getUser(): Promise<AuthenticatedUser | undefined> {
	const context = getUserContext();
	return context.getUserLazy();
}

export async function requireUser(): Promise<AuthenticatedUser> {
	const user = await getUser();

	if (!user) throw new Response(null, { status: 401 });

	return user;
}

export async function isImpersonating(request: Request) {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	return Boolean(session.get(IMPERSONATED_SESSION_KEY));
}
