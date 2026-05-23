export async function ensurePushSubscription(
	registration: ServiceWorkerRegistration,
) {
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
}
