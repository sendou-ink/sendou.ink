import {
	type AuthenticatedUser,
	userAsyncLocalStorage,
} from "~/features/auth/core/user-context.server";

/** Runs `fn` with `userId` as the `actorId()` actor, since seeding happens outside a request. */
export function actAs<T>(userId: number, fn: () => T): T {
	return userAsyncLocalStorage.run(
		{ user: { id: userId } as AuthenticatedUser },
		fn,
	);
}
