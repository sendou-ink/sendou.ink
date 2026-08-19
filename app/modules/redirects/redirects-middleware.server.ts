import { redirect } from "react-router";
import * as Redirect from "./core/Redirect";

type MiddlewareArgs = {
	request: Request;
	url: URL;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

/**
 * Redirects requests targeting a page that has moved. Runs for every kind of request
 * (documents, single fetch data requests and resource routes) so that no route needs to
 * know about the redirects.
 *
 * @see {@link Redirect.resolve}
 */
export const redirectsMiddleware: MiddlewareFn = ({ url }, next) => {
	const redirectTo = Redirect.resolve(url);
	if (redirectTo) throw redirect(redirectTo);

	return next();
};
