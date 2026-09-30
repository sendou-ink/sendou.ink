import {
	getUserFromRequest,
	userAsyncLocalStorage,
} from "./user-context.server";

type MiddlewareArgs = {
	request: Request;
	url: URL;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

export const userMiddleware: MiddlewareFn = async ({ request, url }, next) => {
	const user = await getUserFromRequest(request, url);

	return userAsyncLocalStorage.run({ user }, () => next());
};
