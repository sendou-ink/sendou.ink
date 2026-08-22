import { logger } from "~/utils/logger";
import type { ServerEvent } from "./events-types";

const SSE_URL = "/sse";
const sseTopicsUrl = (connectionId: string) => `/sse/${connectionId}/topics`;

export type EventsReadyState = "CONNECTING" | "CONNECTED" | "CLOSED";

type WireEvent = ServerEvent | { kind: "hello"; connectionId: string };

interface EventsClientDeps {
	openEventSource: (handlers: {
		onMessage: (data: string) => void;
		onError: () => void;
	}) => { close: () => void };
	replaceTopics: (
		connectionId: string,
		topics: string[],
	) => Promise<{ status: number }>;
}

export interface EventsClient {
	/** Opens the SSE connection. No-op while already connected. */
	connect: () => void;
	/** Closes the SSE connection. Desired topics are kept for the next connect. */
	disconnect: () => void;
	/** Snapshot of the connection state; CONNECTED means the server's hello has arrived. */
	getReadyState: () => EventsReadyState;
	/** Subscribes to ready state changes, for `useSyncExternalStore`. Returns an unsubscribe function. */
	subscribeToReadyState: (listener: () => void) => () => void;
	/** Registers a listener for all incoming server events. Returns an unsubscribe function. */
	addEventListener: (listener: (event: ServerEvent) => void) => () => void;
	/** Adds the topic to the desired set (reference counted, replayed on every reconnect). Returns an unsubscribe function. */
	subscribeTopic: (topic: string) => () => void;
}

export function createEventsClient(deps: EventsClientDeps): EventsClient {
	const topicSubscriberCounts = new Map<string, number>();
	const readyStateListeners = new Set<() => void>();
	const eventListeners = new Set<(event: ServerEvent) => void>();

	let source: { close: () => void } | null = null;
	let readyState: EventsReadyState = "CLOSED";
	let connectionId: string | null = null;
	let syncedTopicsKey: string | null = null;
	let syncing = false;

	const setReadyState = (next: EventsReadyState) => {
		if (readyState === next) return;
		readyState = next;
		for (const listener of readyStateListeners) {
			listener();
		}
	};

	const desiredTopics = () => [...topicSubscriberCounts.keys()].sort();

	const syncTopics = async () => {
		if (syncing) return;
		syncing = true;
		try {
			while (true) {
				// wait a microtask so same-tick topic changes coalesce into one PUT
				await Promise.resolve();
				const currentConnectionId = connectionId;
				if (!currentConnectionId) break;

				const topics = desiredTopics();
				const topicsKey = `${currentConnectionId} ${topics.join(" ")}`;
				if (topicsKey === syncedTopicsKey) break;
				if (topics.length === 0 && syncedTopicsKey === null) {
					// a fresh connection has no topics server-side, nothing to replace
					syncedTopicsKey = topicsKey;
					break;
				}

				const response = await deps.replaceTopics(currentConnectionId, topics);
				// 404 = the connection died mid-PUT; the next hello replays the topics
				if (response.status >= 400 && response.status !== 404) {
					logger.error(`Replacing SSE topics failed (${response.status})`);
				}
				syncedTopicsKey = topicsKey;
			}
		} catch (error) {
			logger.error("Replacing SSE topics failed", error);
		} finally {
			syncing = false;
		}
	};

	const handleMessage = (data: string) => {
		let event: WireEvent;
		try {
			event = JSON.parse(data);
		} catch {
			return;
		}

		if (event.kind === "hello") {
			connectionId = event.connectionId;
			syncedTopicsKey = null;
			setReadyState("CONNECTED");
			void syncTopics();
			return;
		}

		for (const listener of eventListeners) {
			listener(event);
		}
	};

	return {
		connect: () => {
			if (source) return;

			setReadyState("CONNECTING");
			source = deps.openEventSource({
				onMessage: handleMessage,
				onError: () => {
					connectionId = null;
					syncedTopicsKey = null;
					if (source) setReadyState("CONNECTING");
				},
			});
		},
		disconnect: () => {
			if (!source) return;

			source.close();
			source = null;
			connectionId = null;
			syncedTopicsKey = null;
			setReadyState("CLOSED");
		},
		getReadyState: () => readyState,
		subscribeToReadyState: (listener) => {
			readyStateListeners.add(listener);
			return () => readyStateListeners.delete(listener);
		},
		addEventListener: (listener) => {
			eventListeners.add(listener);
			return () => eventListeners.delete(listener);
		},
		subscribeTopic: (topic) => {
			const count = topicSubscriberCounts.get(topic) ?? 0;
			topicSubscriberCounts.set(topic, count + 1);
			if (count === 0) void syncTopics();

			let unsubscribed = false;
			return () => {
				if (unsubscribed) return;
				unsubscribed = true;

				const remaining = (topicSubscriberCounts.get(topic) ?? 0) - 1;
				if (remaining > 0) {
					topicSubscriberCounts.set(topic, remaining);
					return;
				}
				topicSubscriberCounts.delete(topic);
				void syncTopics();
			};
		},
	};
}

export const eventsClient = createEventsClient({
	openEventSource: (handlers) => {
		const eventSource = new EventSource(SSE_URL);
		eventSource.addEventListener("message", (event) =>
			handlers.onMessage(event.data),
		);
		eventSource.addEventListener("error", handlers.onError);
		return { close: () => eventSource.close() };
	},
	replaceTopics: async (connectionId, topics) => {
		const response = await fetch(sseTopicsUrl(connectionId), {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ topics }),
		});
		return { status: response.status };
	},
});
