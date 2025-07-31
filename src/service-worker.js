/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

sw.addEventListener('fetch', () => {
	return;
});

sw.addEventListener('push', (event) => {
	if (!event.data) return;

	const { title, ...options } = JSON.parse(event.data.text());

	event.waitUntil(sw.registration.showNotification(title, options));
});

sw.addEventListener('notificationclick', (event) => {
	const targetUrl = event.notification.data.url;
	event.notification.close(); // Android needs explicit close.
	event.waitUntil(
		sw.clients.matchAll({ type: 'window' }).then((windowClients) => {
			// Check if there is already a window/tab open with the target URL
			for (let i = 0; i < windowClients.length; i++) {
				const client = windowClients[i];
				// If so, just focus it.
				if (client.url === targetUrl && 'focus' in client) {
					return client.focus();
				}
			}
			// If not, then open the target URL in a new window/tab.
			if (sw.clients.openWindow) {
				return sw.clients.openWindow(targetUrl);
			}
		})
	);
});
