import {
	type AuthenticatedUser,
	userAsyncLocalStorage,
} from "~/features/auth/core/user-context.server";

/**
 * Runs `fn` inside the acting-user store, so that repository functions resolving
 * the actor via `actorId()` see `userId` as the acting user. Needed because seeding
 * happens outside a request, where there is no acting user at all.
 */
export function actAs<T>(userId: number, fn: () => T): T {
	return userAsyncLocalStorage.run(
		{ user: { id: userId } as AuthenticatedUser },
		fn,
	);
}
