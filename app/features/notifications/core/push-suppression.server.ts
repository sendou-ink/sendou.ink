import { AsyncLocalStorage } from "node:async_hooks";

const suppressionAsyncLocalStorage = new AsyncLocalStorage<true>();

/**
 * Runs `fn` with web pushes off for every notification it creates, scheduled pushes included. In-app
 * notifications are still created. Dev builds only, production builds compile the check out of `notify`.
 */
export function runWithoutWebPush<T>(fn: () => T): T {
	return suppressionAsyncLocalStorage.run(true, fn);
}

/** Whether the current async context was started by {@link runWithoutWebPush}. */
export function isWebPushSuppressed() {
	return suppressionAsyncLocalStorage.getStore() === true;
}
