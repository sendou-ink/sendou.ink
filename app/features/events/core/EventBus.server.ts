import type { ServerEvent } from "../events-types";

interface Subscriber {
	queue: ServerEvent[];
	wake: (() => void) | null;
}

const subscribersByChannel = new Map<string, Set<Subscriber>>();

/** Delivers the event to every live subscriber of the channels, once each even when listening on several. */
export function publish(channels: string[], event: ServerEvent): void {
	const recipients = new Set<Subscriber>();
	for (const channel of channels) {
		for (const subscriber of subscribersByChannel.get(channel) ?? []) {
			recipients.add(subscriber);
		}
	}

	for (const subscriber of recipients) {
		subscriber.queue.push(event);
		subscriber.wake?.();
	}
}

/** Yields the channels' events until the signal aborts (pending events dropped) or the consumer stops iterating. */
export function subscribe(
	channels: string[],
	signal: AbortSignal,
): AsyncIterable<ServerEvent> {
	const subscriber: Subscriber = { queue: [], wake: null };
	const uniqueChannels = [...new Set(channels)];
	let closed = signal.aborted;

	const close = () => {
		if (closed) return;
		closed = true;
		signal.removeEventListener("abort", close);
		for (const channel of uniqueChannels) {
			const subscribers = subscribersByChannel.get(channel);
			if (!subscribers) continue;
			subscribers.delete(subscriber);
			if (subscribers.size === 0) {
				subscribersByChannel.delete(channel);
			}
		}
		subscriber.wake?.();
	};

	if (!closed) {
		for (const channel of uniqueChannels) {
			const existing = subscribersByChannel.get(channel);
			if (existing) {
				existing.add(subscriber);
			} else {
				subscribersByChannel.set(channel, new Set([subscriber]));
			}
		}
		signal.addEventListener("abort", close, { once: true });
	}

	const iterator: AsyncIterator<ServerEvent, undefined> = {
		async next() {
			while (true) {
				if (closed) return { done: true, value: undefined };

				const event = subscriber.queue.shift();
				if (event) return { done: false, value: event };

				await new Promise<void>((resolve) => {
					subscriber.wake = resolve;
				});
				subscriber.wake = null;
			}
		},
		async return() {
			close();
			return { done: true, value: undefined };
		},
	};

	return { [Symbol.asyncIterator]: () => iterator };
}

/** Number of live subscribers on a channel. */
export function subscriberCount(channel: string): number {
	return subscribersByChannel.get(channel)?.size ?? 0;
}
