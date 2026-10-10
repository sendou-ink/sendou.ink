import { AUTH_SESSION_COOKIE_NAME } from "./session.server";
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
	const { user, staleSessionCookie } = await getUserFromRequest(request, url);

	const response = await userAsyncLocalStorage.run({ user }, () => next());

	if (staleSessionCookie && !setsAuthSessionCookie(response)) {
		response.headers.append("Set-Cookie", staleSessionCookie);
	}

	return response;
};

function setsAuthSessionCookie(response: Response) {
	return response.headers
		.getSetCookie()
		.some((cookie) => cookie.startsWith(`${AUTH_SESSION_COOKIE_NAME}=`));
}
