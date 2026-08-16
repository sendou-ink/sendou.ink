import type { MiddlewareFunction } from "react-router";
import { viewerTimezoneAsyncLocalStorage } from "./timezone-context.server";
import { viewerTimezoneFromCookieHeader } from "./timezone-cookie";

/**
 * Resolves the viewer's timezone from their cookie and makes it available to
 * loaders via `getViewerTimezone` for the duration of the request.
 */
export const timezoneMiddleware: MiddlewareFunction<Response> = (
	{ request },
	next,
) =>
	viewerTimezoneAsyncLocalStorage.run(
		{ timezone: viewerTimezoneFromCookieHeader(request.headers.get("Cookie")) },
		() => next(),
	);
