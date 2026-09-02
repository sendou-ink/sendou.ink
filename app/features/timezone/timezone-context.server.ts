import { AsyncLocalStorage } from "node:async_hooks";

interface ViewerTimezoneContext {
	timezone: string | null;
}

export const viewerTimezoneAsyncLocalStorage =
	new AsyncLocalStorage<ViewerTimezoneContext>();

/** `null` until the browser has reported it, i.e. on a device's very first document request. */
export function getViewerTimezone(): string | null {
	return viewerTimezoneAsyncLocalStorage.getStore()?.timezone ?? null;
}
