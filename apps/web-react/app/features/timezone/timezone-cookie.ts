import { z } from "zod";
import { logger } from "~/utils/logger";

const COOKIE_NAME = "timezone";
const TEN_YEARS_IN_MS = 315_360_000_000;

const ianaTimezone = z
	.string()
	.max(100)
	.refine((value) => {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: value });
			return true;
		} catch {
			return false;
		}
	});

/**
 * Stores the browser's IANA timezone in a cookie so that the server can read it
 * while rendering. Neither a request header nor a client hint carries the
 * timezone, so it has to be written client-side before the server can know it.
 */
export function writeViewerTimezoneCookie() {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (!timezone) return;

	void cookieStore
		.set({
			name: COOKIE_NAME,
			value: timezone,
			path: "/",
			expires: Date.now() + TEN_YEARS_IN_MS,
			sameSite: "lax",
		})
		.catch((error) =>
			logger.error("Failed to store the timezone cookie", error),
		);
}

/**
 * The viewer's IANA timezone as written by {@link writeViewerTimezoneCookie}.
 * `null` when the cookie is missing or holds something that is not a timezone.
 */
export function viewerTimezoneFromCookieHeader(
	header: string | null,
): string | null {
	const value = header
		?.split(";")
		.map((cookie) => cookie.trim())
		.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
		?.slice(COOKIE_NAME.length + 1);

	const parsed = ianaTimezone.safeParse(value);

	return parsed.success ? parsed.data : null;
}
