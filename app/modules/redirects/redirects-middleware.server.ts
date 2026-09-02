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

/** Redirects moved pages for every kind of request (documents, data, resource routes), see {@link Redirect.resolve}. */
export const redirectsMiddleware: MiddlewareFn = ({ url }, next) => {
	const redirectTo = Redirect.resolve(url);
	if (redirectTo) throw redirect(redirectTo);

	return next();
};
