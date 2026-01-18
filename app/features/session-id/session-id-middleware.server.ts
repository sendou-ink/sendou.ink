import { sessionIdAsyncLocalStorage } from "./session-id-context.server";

type MiddlewareArgs = {
	request: Request;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

export const sessionIdMiddleware: MiddlewareFn = async ({ request }, next) => {
	const sessionId = request.headers.get("Sendou-Session-Id") ?? undefined;

	return sessionIdAsyncLocalStorage.run({ sessionId }, () => next());
};
