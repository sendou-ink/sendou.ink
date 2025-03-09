self.addEventListener("fetch", () => {
	return;
});

self.addEventListener("push", (event) => {
	const { title, ...options } = JSON.parse(event.data.text());

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	const targetUrl = event.notification.data.url;
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
