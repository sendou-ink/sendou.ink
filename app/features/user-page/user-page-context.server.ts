import { AsyncLocalStorage } from "node:async_hooks";

export type UserPageUser = {
	id: number;
	discordId: string;
	customUrl: string | null;
};

export const userPageAsyncLocalStorage = new AsyncLocalStorage<{
	user: UserPageUser;
}>();

/** The user whose page is being viewed, resolved once per request from the URL identifier. */
export function userPageUser(): UserPageUser {
	const context = userPageAsyncLocalStorage.getStore();

	if (!context) {
		throw new Error("No user page context, is the route under /u/:identifier?");
	}

	return context.user;
}

/** Id of the user whose page is being viewed. */
export function userPageUserId(): number {
	return userPageUser().id;
}
