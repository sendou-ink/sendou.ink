self.addEventListener("fetch", () => {
	return;
});

// xxx: handle dynamic data
self.addEventListener("push", (event) => {
	const options = {
		body: event.data.text(),
		icon: "/apple-touch-icon.png",
		badge: "/badge.png",
	};
	event.waitUntil(self.registration.showNotification("My App", options));
});
