import { AsyncLocalStorage } from "node:async_hooks";

interface ViewerTimezoneContext {
	timezone: string | null;
}

export const viewerTimezoneAsyncLocalStorage =
	new AsyncLocalStorage<ViewerTimezoneContext>();

/**
 * The viewer's IANA timezone for the current request. `null` when the browser has
 * not reported it yet, which is the case for a device's very first document request.
 */
export function getViewerTimezone(): string | null {
	return viewerTimezoneAsyncLocalStorage.getStore()?.timezone ?? null;
}
