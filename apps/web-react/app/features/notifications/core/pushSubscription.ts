import { Config } from "~/config";
import { logger } from "~/utils/logger";
import { NOTIFICATIONS_SUBSCRIBE_ROUTE } from "~/utils/urls";

/** Whether this browser supports push notifications. Only call after hydration. */
export function isPushSupported() {
	return (
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

/**
 * Subscribes this browser to push notifications (reusing the existing
 * subscription if one is live) and syncs it to the server. Throws if
 * subscribing or the server sync fails, meaning the server might not know
 * where to deliver push notifications for this browser.
 */
export async function subscribeToPush() {
	const registration = await navigator.serviceWorker.register("/sw-2.js");
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: Config.vapid.publicKey,
		}));

	const response = await fetch(NOTIFICATIONS_SUBSCRIBE_ROUTE, {
		method: "post",
		body: JSON.stringify(subscription),
		headers: { "content-type": "application/json" },
	});
	if (!response.ok) {
		throw new Error(
			`Syncing push subscription to server failed: ${response.status}`,
		);
	}
}

/**
 * The live push subscription of this browser, or null when there is none
 * (never subscribed, expired, or revoked). Only call after hydration.
 */
export async function findPushSubscription() {
	const registration = await navigator.serviceWorker.getRegistration();
	return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Self-heals push delivery for a browser that has already opted in: if the
 * subscription expired, was revoked by the browser, or the server lost/deleted
 * its copy (e.g. after the push service returned 410 Gone), this resubscribes
 * and re-syncs so notifications keep arriving. Safe to call on every app
 * load; a failure is swallowed as the next load retries.
 */
export async function resyncPushSubscription() {
	if (!isPushSupported() || Notification.permission !== "granted") return;

	try {
		await subscribeToPush();
	} catch (err) {
		logger.error("Failed to resync push subscription", err);
	}
}
