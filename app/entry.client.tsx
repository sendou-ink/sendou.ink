import * as Sentry from "@sentry/react-router";
import "@formatjs/intl-durationformat/polyfill.js";
import i18next from "i18next";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import { Config } from "~/config";
import type { LanguageCode } from "~/modules/i18n/config";
import { i18nLoader } from "./modules/i18n/loader";
import { loadDateFnsLocale } from "./utils/dates";
import { logger } from "./utils/logger";
import { getSessionId } from "./utils/session-id";

const SENTRY_ENABLED = Config.sentry.enabled;

const tracing = SENTRY_ENABLED
	? Sentry.reactRouterTracingIntegration({
			useInstrumentationAPI: true,
		})
	: null;

if (SENTRY_ENABLED) {
	Sentry.init({
		dsn: Config.sentry.dsn,
		sendDefaultPii: false,
		integrations: [
			tracing!,
			Sentry.thirdPartyErrorFilterIntegration({
				filterKeys: ["sendou-ink"],
				behaviour: "drop-error-if-contains-third-party-frames",
			}),
		],
		enableLogs: true,
		tracesSampleRate: 0.1,
		tracePropagationTargets: [/^\//],
	});
}

/** Base delays in milliseconds before each retry attempt following the initial request. */
const FETCH_RETRY_DELAYS_MS = [0, 5000, 15000];
/** Random jitter added to each retry delay to avoid a thundering herd against a struggling server. */
const FETCH_RETRY_JITTER_MS = 1000;

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

	const sessionId = getSessionId();
	const headers = new Headers(init?.headers);
	headers.set("Sendou-Session-Id", sessionId);

	return fetchWithRetry(input, { ...init, headers });
};

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
		// we will register it after the page complete the load
		void navigator.serviceWorker.register("/sw-2.js");
	});
}

// the server rendered with the page language's date-fns locale, so it must be
// cached before hydration to avoid a markup mismatch
Promise.all([
	i18nLoader(),
	loadDateFnsLocale(document.documentElement.lang as LanguageCode),
])
	.then(() =>
		hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<HydratedRouter
					instrumentations={tracing ? [tracing.clientInstrumentation] : []}
					onError={(error) => {
						if (SENTRY_ENABLED && error && error instanceof Error) {
							Sentry.captureException(error);
						}
					}}
				/>
			</I18nextProvider>,
		),
	)
	.catch(logger.error);
