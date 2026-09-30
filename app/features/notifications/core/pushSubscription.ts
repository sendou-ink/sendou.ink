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

/** Subscribes this browser to push (reusing a live subscription) and syncs it to the server. Throws if either fails, meaning the server may not know where to deliver. */
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

/** This browser's live push subscription, or null (never subscribed, expired, revoked). Only call after hydration. */
export async function findPushSubscription() {
	const registration = await navigator.serviceWorker.getRegistration();
	return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Self-heals push for an opted-in browser: resubscribes and re-syncs when the subscription expired, was revoked, or the server lost its copy (e.g. 410 Gone). Safe on every load; failures are swallowed. */
export async function resyncPushSubscription() {
	if (!isPushSupported() || Notification.permission !== "granted") return;

	try {
		await subscribeToPush();
	} catch (err) {
		logger.error("Failed to resync push subscription", err);
	}
}
