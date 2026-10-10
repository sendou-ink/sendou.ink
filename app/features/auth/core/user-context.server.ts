import { AsyncLocalStorage } from "node:async_hooks";
import { redirect } from "react-router";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { SUSPENDED_PAGE } from "~/utils/urls";
import { IMPERSONATED_SESSION_KEY, SESSION_KEY } from "./authenticator.server";
import { authSessionStorage } from "./session.server";

export type AuthenticatedUser = NonNullable<
	Awaited<ReturnType<typeof UserRepository.findLeanById>>
>;

interface UserContext {
	user: AuthenticatedUser | undefined;
}

export const userAsyncLocalStorage = new AsyncLocalStorage<UserContext>();

export function getUserContext(): UserContext {
	const context = userAsyncLocalStorage.getStore();
	if (!context) {
		throw new Error("getUserContext called outside of user middleware context");
	}
	return context;
}

/** `staleSessionCookie` is set when the session points at a user that no longer exists (e.g. merged away by an account migration) and clears it. */
export async function getUserFromRequest(
	request: Request,
	url: URL,
): Promise<{
	user: AuthenticatedUser | undefined;
	staleSessionCookie?: string;
}> {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	const impersonatedUserId = session.get(IMPERSONATED_SESSION_KEY);
	const userId = impersonatedUserId ?? session.get(SESSION_KEY);

	if (!userId) return { user: undefined };

	if (userIsBanned(userId)) {
		const isExemptPath =
			url.pathname === SUSPENDED_PAGE ||
			// needed for ban E2E tests
			url.pathname.startsWith("/auth/impersonate");
		if (!isExemptPath) {
			throw redirect(SUSPENDED_PAGE);
		}
	}

	const user = await UserRepository.findLeanById(userId);
	if (user) return { user };

	if (impersonatedUserId) {
		session.unset(IMPERSONATED_SESSION_KEY);
		return {
			user: undefined,
			staleSessionCookie: await authSessionStorage.commitSession(session),
		};
	}

	return {
		user: undefined,
		staleSessionCookie: await authSessionStorage.destroySession(session),
	};
}
