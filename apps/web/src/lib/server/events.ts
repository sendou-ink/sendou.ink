/**
 * In-process event bus connecting mutations to live queries (`query.live`).
 * Mutations `publish()` to a channel; live-query generators `subscribe()` to
 * it and re-yield a fresh snapshot on every wake-up. Viable because the app is
 * a single Node process — no cross-instance pubsub exists or is needed.
 *
 * Subscribers coalesce: publishes that land while the subscriber is busy
 * producing a snapshot collapse into one pending wake-up, so generators always
 * yield snapshots, never an event log.
 */

const DEFAULT_HEARTBEAT_MS = 30_000;

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
 * Yields once per (coalesced) publish on the channel, and additionally on a
 * heartbeat interval so long-lived streams keep writing through proxies that
 * idle-timeout quiet connections. Unsubscribes when the consumer stops
 * iterating (client disconnect unwinds the generator via `finally`).
 */
export async function* subscribe(
	channel: string,
	{ heartbeatMs = DEFAULT_HEARTBEAT_MS }: { heartbeatMs?: number } = {},
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
		while (true) {
			if (!pending) {
				await new Promise<void>((resolve) => {
					wake = resolve;
					if (heartbeatMs !== Number.POSITIVE_INFINITY) {
						setTimeout(resolve, heartbeatMs).unref();
					}
				});
				wake = null;
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
