import "@formatjs/intl-durationformat/polyfill.js";
import i18next from "i18next";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import { i18nLoader } from "./modules/i18n/loader";
import { logger } from "./utils/logger";
import { ensurePushSubscription } from "./utils/push-subscription";
import { getSessionId } from "./utils/session-id";

const originalFetch = window.fetch;
window.fetch = (input, init) => {
	const sessionId = getSessionId();
	const headers = new Headers(init?.headers);
	headers.set("Sendou-Session-Id", sessionId);
	return originalFetch(input, { ...init, headers });
};

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw-2.js").then((registration) => {
			if (
				"Notification" in window &&
				"PushManager" in window &&
				Notification.permission === "granted" &&
				!sessionStorage.getItem("push-renewed")
			) {
				sessionStorage.setItem("push-renewed", "1");
				void ensurePushSubscription(registration).catch(logger.error);
			}
		});
	});
}

i18nLoader()
	.then(() =>
		hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<HydratedRouter />
			</I18nextProvider>,
		),
	)
	.catch(logger.error);
