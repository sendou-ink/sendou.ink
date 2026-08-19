import { redirect } from "react-router";
import { resolveRedirect } from ".";

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
 * @see {@link resolveRedirect}
 */
export const redirectsMiddleware: MiddlewareFn = ({ url }, next) => {
	const redirectTo = resolveRedirect(url);
	if (redirectTo) throw redirect(redirectTo);

	return next();
};
