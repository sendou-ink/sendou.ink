import "@formatjs/intl-durationformat/polyfill.js";
import i18next from "i18next";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import { i18nLoader } from "./modules/i18n/loader";
import { logger } from "./utils/logger";
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
				void renewPushSubscription(registration);
			}
		});
	});
}

async function renewPushSubscription(registration: ServiceWorkerRegistration) {
	try {
		const existing = await registration.pushManager.getSubscription();

		const isExpired =
			existing?.expirationTime != null && existing.expirationTime <= Date.now();

		let subscription = existing;
		if (!subscription || isExpired) {
			if (isExpired) {
				await existing?.unsubscribe();
			}
			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
			});
		}

		await fetch("/notifications/subscribe", {
			method: "post",
			body: JSON.stringify(subscription),
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		logger.error(error);
	}
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
