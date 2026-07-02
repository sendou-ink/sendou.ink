import { runWithRequestContext } from "./request-context.server";

type MiddlewareArgs = {
	request: Request;
	url: URL;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

// TODO: this is only needed for our current hacky toast setup, once a proper one in place this middleware can be deleted
export const requestContextMiddleware: MiddlewareFn = ({ url }, next) =>
	runWithRequestContext({ url }, () => next());
