import i18next from "i18next";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import * as ConsoleCapture from "~/features/dev-tools/core/ConsoleCapture";
import type { LanguageCode } from "~/modules/i18n/config";
import { writeViewerTimezoneCookie } from "./features/timezone/timezone-cookie";
import { i18nLoader } from "./modules/i18n/loader";
import { loadDateFnsLocale } from "./utils/dates";
import { logger } from "./utils/logger";
import { getSessionId } from "./utils/session-id";

const FETCH_RETRY_DELAYS_MS = [0, 5000, 15000];
/** avoids a thundering herd against a struggling server */
const FETCH_RETRY_JITTER_MS = 1000;
const DATA_GENERATION_COOKIE = "dataGeneration";

// before hydration so the dev toolbar sees hydration mismatches too
if (import.meta.env.DEV) ConsoleCapture.install();

writeViewerTimezoneCookie();

const originalFetch = window.fetch;
window.fetch = (input, init) => {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	const isSameOrigin =
		url.startsWith("/") ||
		new URL(url, window.location.origin).origin === window.location.origin;

	if (!isSameOrigin) {
		return originalFetch(input, init);
	}

	const method =
		init?.method ?? (input instanceof Request ? input.method : "GET");
	if (!isRetryableMethod(method)) {
		invalidatePrefetchedLoaderData();
	}

	const sessionId = getSessionId();
	const headers = new Headers(init?.headers);
	headers.set("Sendou-Session-Id", sessionId);

	return fetchWithRetry(input, { ...init, headers });
};

/**
 * Hover-prefetched loader responses stay in the HTTP cache for a few seconds, varying by cookie
 * (`handleDataRequest` in entry.server.tsx). A mutation outdates them, so changing this cookie
 * keeps the revalidation that follows it, and the visits after, from being served one.
 */
function invalidatePrefetchedLoaderData() {
	// biome-ignore lint/suspicious/noDocumentCookie: has to be in place synchronously, before the mutation's revalidation requests go out
	document.cookie = `${DATA_GENERATION_COOKIE}=${Date.now()}; path=/; samesite=lax`;
}

const isRetryableMethod = (method: string) => {
	const normalized = method.toUpperCase();
	return normalized === "GET" || normalized === "HEAD";
};

const wait = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
	input: RequestInfo | URL,
	init: RequestInit,
): Promise<Response> {
	const method =
		init.method ?? (input instanceof Request ? input.method : "GET");

	if (!isRetryableMethod(method)) {
		return originalFetch(input, init);
	}

	let lastError: unknown;
	for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
		if (attempt > 0) {
			await wait(
				FETCH_RETRY_DELAYS_MS[attempt - 1] +
					Math.random() * FETCH_RETRY_JITTER_MS,
			);
		}

		try {
			const response = await originalFetch(input, init);

			// retry on server errors, but let the caller handle other statuses
			if (response.status >= 500 && attempt < FETCH_RETRY_DELAYS_MS.length) {
				continue;
			}

			return response;
		} catch (error) {
			// a cancelled request (e.g. a superseded navigation) must fail fast, not retry
			if (
				init.signal?.aborted ||
				(error instanceof DOMException && error.name === "AbortError")
			) {
				throw error;
			}

			lastError = error;
			if (attempt === FETCH_RETRY_DELAYS_MS.length) {
				throw error;
			}
		}
	}

	throw lastError;
}

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw-2.js");
	});
}

// the server rendered with the page language's date-fns locale, so cache it before hydration
Promise.all([
	i18nLoader(),
	loadDateFnsLocale(document.documentElement.lang as LanguageCode),
])
	.then(() =>
		hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<HydratedRouter />
			</I18nextProvider>,
		),
	)
	.catch(logger.error);
