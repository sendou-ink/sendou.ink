const UNSEEN_DOT_GRACE_MS = 10_000;

/**
 * Whether the bell should show its unseen dot. An unseen notification born
 * while the session is already open only counts once it has stayed unseen past
 * a short grace period: one about something the user is already on their way
 * to (e.g. a SendouQ match that just started, with the redirect to the match
 * page a second away) resolves itself right after, and the dot flashing for
 * it would be false signal. Notifications predating the session show the dot
 * right away — anything that was going to resolve them already ran before the
 * first notifications snapshot.
 *
 * Construct during component init (it registers an `$effect` for the timer
 * that advances the clock to the next pending show time).
 */
export class UnseenNotificationsDot {
	#getNotifications: () =>
		| Array<{ createdAt: number; seen: number }>
		| undefined;
	#mountedAt = Date.now();
	#now = $state(Date.now());

	constructor(
		getNotifications: () =>
			| Array<{ createdAt: number; seen: number }>
			| undefined,
	) {
		this.#getNotifications = getNotifications;

		$effect(() => {
			if (this.show) return;

			const showTimes = this.#dotShowTimes();
			if (showTimes.length === 0) return;

			const nextShowTime = Math.min(...showTimes);
			const timeout = setTimeout(
				() => {
					this.#now = Date.now();
				},
				Math.max(0, nextShowTime - Date.now()) + 100,
			);
			return () => clearTimeout(timeout);
		});
	}

	#dotShowTimes() {
		return (this.#getNotifications() ?? [])
			.filter((notification) => !notification.seen)
			.map((notification) => {
				const createdAtMs = notification.createdAt * 1000;

				return createdAtMs <= this.#mountedAt
					? this.#mountedAt
					: createdAtMs + UNSEEN_DOT_GRACE_MS;
			});
	}

	get show() {
		return this.#dotShowTimes().some((showTime) => showTime <= this.#now);
	}
}
