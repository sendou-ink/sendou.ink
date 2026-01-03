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

export async function getUserFromRequest(
	request: Request,
): Promise<AuthenticatedUser | undefined> {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	const userId =
		session.get(IMPERSONATED_SESSION_KEY) ?? session.get(SESSION_KEY);

	if (!userId) return undefined;

	if (userIsBanned(userId)) {
		const url = new URL(request.url);
		if (url.pathname !== SUSPENDED_PAGE) {
			throw redirect(SUSPENDED_PAGE);
		}
	}

	return UserRepository.findLeanById(userId);
}
