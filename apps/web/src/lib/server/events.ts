/**
 * In-process event bus connecting mutations to live queries (`query.live`).
 * Mutations `publish()` to a channel; live-query generators `subscribe()` to
 * it and re-yield a fresh snapshot on every wake-up. Viable because the app is
 * a single Node process — no cross-instance pubsub exists or is needed.
 *
 * Subscribers coalesce: publishes that land while the subscriber is busy
 * producing a snapshot collapse into one pending wake-up, so generators always
 * yield snapshots, never an event log.
 *
 * There is deliberately no periodic wake-up: SvelteKit's live-query transport
 * writes its own `: keep-alive` SSE comment on an idle timer, so a quiet
 * subscription does not need to build (and throw away) snapshots to hold the
 * connection open. Snapshots that go stale purely with the passage of time —
 * a chat room turning archived, scrim tracking auto-locking — instead pass
 * `wakeAt` and get woken once, at the boundary.
 */

/** Node clamps longer delays to 1ms, which would spin; waking early is harmless. */
const MAX_TIMEOUT_MS = 2_147_483_647;

type Wake = () => void;

const channels = new Map<string, Set<Wake>>();

/** Wakes every subscriber of the channel. */
export function publish(channel: string) {
	const wakes = channels.get(channel);
	if (!wakes) return;

	for (const wake of wakes) {
		wake();
	}
}

/**
 * Yields once per (coalesced) publish on the channel, until `signal` aborts.
 *
 * `signal` is required rather than optional because a generator parked on an
 * `await` cannot be unwound: `return()` on it is queued until it next reaches a
 * `yield`, so without the abort waking the sleep, a disconnected client's
 * subscriber would stay in the channel forever.
 *
 * `wakeAt` is consulted before every sleep and may name the moment the
 * consumer's latest snapshot goes stale on its own, waking it then as well; a
 * deadline already in the past is ignored, since that transition is part of the
 * snapshot just produced.
 */
export async function* subscribe(
	channel: string,
	{
		signal,
		wakeAt,
	}: {
		/** Request abort signal, i.e. `getRequestEvent().request.signal`. */
		signal: AbortSignal;
		wakeAt?: () => Date | null;
	},
): AsyncGenerator<void> {
	let pending = false;
	let wake: Wake | null = null;

	const listener = () => {
		pending = true;
		wake?.();
	};

	let wakes = channels.get(channel);
	if (!wakes) {
		wakes = new Set();
		channels.set(channel, wakes);
	}
	wakes.add(listener);

	try {
		while (!signal.aborted) {
			if (!pending) {
				const staleInMs = msUntilStale(wakeAt?.() ?? null);
				let timer: ReturnType<typeof setTimeout> | undefined;

				await new Promise<void>((resolve) => {
					wake = () => resolve();
					signal.addEventListener("abort", wake, { once: true });
					if (staleInMs !== null) {
						timer = setTimeout(wake, staleInMs).unref();
					}
				});

				clearTimeout(timer);
				if (wake) signal.removeEventListener("abort", wake);
				wake = null;

				if (signal.aborted) return;
			}
			pending = false;
			yield;
		}
	} finally {
		wakes.delete(listener);
		if (wakes.size === 0) {
			channels.delete(channel);
		}
	}
}

function msUntilStale(deadline: Date | null) {
	if (deadline === null) return null;

	const delay = deadline.getTime() - Date.now();
	if (delay <= 0) return null;

	return Math.min(delay, MAX_TIMEOUT_MS);
}

/** Number of active subscribers on a channel (for tests & diagnostics). */
export function subscriberCount(channel: string) {
	return channels.get(channel)?.size ?? 0;
}

export function notificationsChannel(userId: number) {
	return `notifications:${userId}`;
}

export function chatRoomChannel(chatRoomId: number) {
	return `chat-room:${chatRoomId}`;
}

export function chatRoomsOfUserChannel(userId: number) {
	return `chat-rooms-of-user:${userId}`;
}

export function scrimPostsChannel() {
	return "scrim-posts";
}

export function scrimChannel(scrimPostId: number) {
	return `scrim:${scrimPostId}`;
}
