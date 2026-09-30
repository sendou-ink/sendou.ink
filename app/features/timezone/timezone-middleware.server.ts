import type { MiddlewareFunction } from "react-router";
import { viewerTimezoneAsyncLocalStorage } from "./timezone-context.server";
import { viewerTimezoneFromCookieHeader } from "./timezone-cookie";

/** Reads the timezone cookie into request context for `getViewerTimezone`. */
export const timezoneMiddleware: MiddlewareFunction<Response> = (
	{ request },
	next,
) =>
	viewerTimezoneAsyncLocalStorage.run(
		{ timezone: viewerTimezoneFromCookieHeader(request.headers.get("Cookie")) },
		() => next(),
	);
