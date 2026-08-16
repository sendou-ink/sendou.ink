import { AsyncLocalStorage } from "node:async_hooks";

// TODO: this is only needed for our current hacky toast setup, once a proper one in place this middleware can be deleted

interface RequestContext {
	/** Normalized request URL, as provided to middleware in framework mode
	 *  (single-fetch `.data` suffix and internal search params removed). */
	url: URL;
}

const requestContextAsyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with the given request context available to server-side helpers
 *  (e.g. toast redirects) that don't otherwise receive the request. */
export function runWithRequestContext<T>(
	context: RequestContext,
	fn: () => T,
): T {
	return requestContextAsyncLocalStorage.run(context, fn);
}

/** Normalized pathname of the current request, or `undefined` outside a request
 *  context. Used to build absolute redirects from helpers lacking the request. */
export function currentRequestPathname(): string | undefined {
	return requestContextAsyncLocalStorage.getStore()?.url.pathname;
}
