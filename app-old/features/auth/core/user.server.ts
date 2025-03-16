import { redirect } from "@remix-run/node";
import type { User } from "~/db/types";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { SUSPENDED_PAGE } from "~/utils/urls";
import { IMPERSONATED_SESSION_KEY, SESSION_KEY } from "./authenticator.server";
import { authSessionStorage } from "./session.server";

export async function getUserId(
	request: Request,
	redirectIfBanned = true,
): Promise<Pick<User, "id"> | undefined> {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	const userId =
		session.get(IMPERSONATED_SESSION_KEY) ?? session.get(SESSION_KEY);

	if (!userId) return;

	if (userIsBanned(userId) && redirectIfBanned) throw redirect(SUSPENDED_PAGE);

	return { id: userId };
}

export async function getUser(request: Request, redirectIfBanned = true) {
	const userId = (await getUserId(request, redirectIfBanned))?.id;

	if (!userId) return;

	return UserRepository.findLeanById(userId);
}

export async function requireUserId(request: Request) {
	const user = await getUserId(request);

	if (!user) throw new Response(null, { status: 401 });

	return user;
}

export async function requireUser(request: Request) {
	const user = await getUser(request);

	if (!user) throw new Response(null, { status: 401 });

	return user;
}

export async function isImpersonating(request: Request) {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	return Boolean(session.get(IMPERSONATED_SESSION_KEY));
}
