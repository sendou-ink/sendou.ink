import {
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

export const userMiddleware: MiddlewareFn = async ({ request }, next) => {
	const user = await getUserFromRequest(request);

	return userAsyncLocalStorage.run({ user }, () => next());
};
