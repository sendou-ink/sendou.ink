import * as UserRepository from '$lib/server/db/repositories/user';
import { getRequestEvent } from '$app/server';

export type AuthenticatedUser = UserRepository.FindWithRolesByIdResult;

// export async function getUserId(
// 	request: Request,
// 	redirectIfBanned = true,
// ): Promise<Pick<Tables["User"], "id"> | undefined> {
// 	const session = await authSessionStorage.getSession(
// 		request.headers.get("Cookie"),
// 	);

// 	const userId =
// 		session.get(IMPERSONATED_SESSION_KEY) ?? session.get(SESSION_KEY);

// 	if (!userId) return;

// 	if (userIsBanned(userId) && redirectIfBanned) throw redirect(SUSPENDED_PAGE);

// 	return { id: userId };
// }

export async function getUser(/*_redirectIfBanned = true*/) {
	// xxx: handle redirectIfBanned logic later
	const { locals } = getRequestEvent();

	if (locals.user) {
		return locals.user;
	}

	const userPromise = loggedInUserWithRolesFromSession();
	locals.user = userPromise;

	return userPromise;
}

async function loggedInUserWithRolesFromSession() {
	const userId = 274; // xxx: hardcoded for now, to be replaced with actual session logic

	if (typeof userId !== 'number') return;

	return UserRepository.findWithRolesById(userId);
}

// export async function requireUserId(request: Request) {
// 	const user = await getUserId(request);

// 	if (!user) throw new Response(null, { status: 401 });

// 	return user;
// }

// export async function requireUser(request: Request) {
// 	const user = await getUser(request);

// 	if (!user) throw new Response(null, { status: 401 });

// 	return user;
// }

// export async function isImpersonating(request: Request) {
// 	const session = await authSessionStorage.getSession(
// 		request.headers.get("Cookie"),
// 	);

// 	return Boolean(session.get(IMPERSONATED_SESSION_KEY));
// }
