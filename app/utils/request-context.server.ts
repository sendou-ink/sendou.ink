import { AsyncLocalStorage } from "node:async_hooks";

// TODO: this is only needed for our current hacky toast setup, once a proper one in place this middleware can be deleted

interface RequestContext {
	/** Normalized (single-fetch `.data` suffix and internal search params removed) */
	url: URL;
}

const requestContextAsyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with the request context available to helpers (e.g. toast redirects) lacking the request. */
export function runWithRequestContext<T>(
	context: RequestContext,
	fn: () => T,
): T {
	return requestContextAsyncLocalStorage.run(context, fn);
}

/** Pathname of the current request, `undefined` outside a request context. */
export function currentRequestPathname(): string | undefined {
	return requestContextAsyncLocalStorage.getStore()?.url.pathname;
}
