import * as v from "valibot";
import { logger } from "~/utils/logger";

const COOKIE_NAME = "timezone";
const TEN_YEARS_IN_MS = 315_360_000_000;

const ianaTimezone = v.pipe(
	v.string(),
	v.maxLength(100),
	v.check((value) => {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}),
);

/** No request header or client hint carries the timezone, so the browser writes it to a cookie for the server. */
export function writeViewerTimezoneCookie() {
	try {
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (!timezone) return;

		if (typeof cookieStore === "undefined") {
			// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is only available in WebKit from iOS/Safari 18.4; this fallback keeps older iPhones working
			document.cookie = `${COOKIE_NAME}=${timezone}; path=/; max-age=${
				TEN_YEARS_IN_MS / 1000
			}; samesite=lax`;
			return;
		}

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
	} catch (error) {
		logger.error("Failed to store the timezone cookie", error);
	}
}

/** Timezone written by {@link writeViewerTimezoneCookie}; `null` when missing or not a timezone. */
export function viewerTimezoneFromCookieHeader(
	header: string | null,
): string | null {
	const value = header
		?.split(";")
		.map((cookie) => cookie.trim())
		.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
		?.slice(COOKIE_NAME.length + 1);

	const parsed = v.safeParse(ianaTimezone, value);

	return parsed.success ? parsed.output : null;
}
