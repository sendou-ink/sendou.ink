// keeps `beforeinstallprompt` firing (Chrome installability still requires a fetch
// handler); Chrome 115+ detects it as no-op and skips the worker on navigation
self.addEventListener("fetch", () => {
	return;
});

self.addEventListener("push", (event) => {
	// a push that shows no notification can count against the subscription in
	// some browsers, so a missing or malformed payload still shows a fallback
	let title = "sendou.ink";
	let options = { body: "You have a new notification" };
	try {
		const { title: payloadTitle, ...payloadOptions } = event.data.json();
		if (payloadTitle) {
			title = payloadTitle;
			options = payloadOptions;
		}
	} catch {
		// use the fallback
	}

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("pushsubscriptionchange", (event) => {
	event.waitUntil(resubscribe(event));
});

async function resubscribe(event) {
	let subscription = event.newSubscription;

	if (!subscription) {
		const applicationServerKey =
			event.oldSubscription?.options.applicationServerKey;
		// without the VAPID key subscribing is not possible from the worker;
		// the next page load resubscribes instead
		if (!applicationServerKey) return;

		subscription = await self.registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey,
		});
	}

	await fetch("/notifications/subscribe", {
		method: "post",
		body: JSON.stringify(subscription),
		headers: { "content-type": "application/json" },
	});
}

self.addEventListener("notificationclick", (event) => {
	// notification links are relative paths; client urls are absolute
	const targetUrl = new URL(
		event.notification.data?.url ?? "/",
		self.location.origin,
	).href;
	event.notification.close(); // Android needs explicit close.
	event.waitUntil(
		clients.matchAll({ type: "window" }).then((windowClients) => {
			// Check if there is already a window/tab open with the target URL
			for (let i = 0; i < windowClients.length; i++) {
				const client = windowClients[i];
				// If so, just focus it.
				if (client.url === targetUrl && "focus" in client) {
					return client.focus();
				}
			}
			// If not, then open the target URL in a new window/tab.
			if (clients.openWindow) {
				return clients.openWindow(targetUrl);
			}
		}),
	);
});
