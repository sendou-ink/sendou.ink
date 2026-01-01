import {
	type AuthenticatedUser,
	getUserFromRequest,
	userAsyncLocalStorage,
} from "./user-context.server";

type MiddlewareArgs = {
	request: Request;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

function createLazyUserGetter(
	request: Request,
): () => Promise<AuthenticatedUser | undefined> {
	let fetchPromise: Promise<AuthenticatedUser | undefined> | undefined;

	return () => {
		fetchPromise ??= getUserFromRequest(request);
		return fetchPromise;
	};
}

export const userMiddleware: MiddlewareFn = async ({ request }, next) => {
	const context = {
		getUserLazy: createLazyUserGetter(request),
	};

	return userAsyncLocalStorage.run(context, () => next());
};
