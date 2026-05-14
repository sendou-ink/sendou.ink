import * as Sentry from "@sentry/react-router";
import "@formatjs/intl-durationformat/polyfill.js";
import i18next from "i18next";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import { i18nLoader } from "./modules/i18n/loader";
import { logger } from "./utils/logger";
import { getSessionId } from "./utils/session-id";

const tracing = Sentry.reactRouterTracingIntegration({
	useInstrumentationAPI: true,
});

Sentry.init({
	dsn: import.meta.env.VITE_SENTRY_DSN,
	sendDefaultPii: false,
	integrations: [
		tracing,
		Sentry.thirdPartyErrorFilterIntegration({
			filterKeys: ["sendou-ink"],
			behaviour: "drop-error-if-contains-third-party-frames",
		}),
	],
	enableLogs: true,
	tracesSampleRate: 0.1,
	tracePropagationTargets: [/^\//],
});

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
	return originalFetch(input, { ...init, headers });
};

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		// we will register it after the page complete the load
		void navigator.serviceWorker.register("/sw-2.js");
	});
}

i18nLoader()
	.then(() =>
		hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<HydratedRouter
					instrumentations={[tracing.clientInstrumentation]}
					onError={(error) => {
						if (error && error instanceof Error) {
							Sentry.captureException(error);
						}
					}}
				/>
			</I18nextProvider>,
		),
	)
	.catch(logger.error);
