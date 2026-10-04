import { logger } from "~/utils/logger";
import { HEARTBEAT_INTERVAL_MS, type ServerEvent } from "./events-types";

const SSE_URL = "/sse";
const sseTopicsUrl = (connectionId: string) => `/sse/${connectionId}/topics`;
// a connection dropped while the app was suspended raises no error of its own
const SILENT_CONNECTION_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2 + 15_000;
// wall clock checked on an interval, as timers don't advance while the device sleeps
const LIVENESS_CHECK_INTERVAL_MS = 5_000;
const REOPEN_BASE_DELAY_MS = 1_000;
const REOPEN_MAX_DELAY_MS = 30_000;

export type EventsReadyState = "CONNECTING" | "CONNECTED" | "CLOSED";

type WireEvent =
	| ServerEvent
	| { kind: "hello"; connectionId: string }
	| { kind: "heartbeat" };

interface EventsClientDeps {
	openEventSource: (handlers: {
		onMessage: (data: string) => void;
		/** `permanent` when the source gave up and won't reconnect on its own (e.g. a non-200 response). */
		onError: (permanent: boolean) => void;
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

	let active = false;
	let source: { close: () => void } | null = null;
	let readyState: EventsReadyState = "CLOSED";
	let connectionId: string | null = null;
	let syncedTopicsKey: string | null = null;
	let syncing = false;
	let lastMessageAt = 0;
	let livenessCheck: ReturnType<typeof setInterval> | null = null;
	let scheduledReopen: ReturnType<typeof setTimeout> | null = null;
	let failedReopens = 0;

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
					markSynced(topicsKey);
					break;
				}

				const status = await deps
					.replaceTopics(currentConnectionId, topics)
					.then(
						(response) => response.status,
						(error) => {
							logger.error("Replacing SSE topics failed", error);
							return null;
						},
					);
				// the connection was replaced mid-PUT, the next round syncs the new one
				if (currentConnectionId !== connectionId) continue;

				if (status !== null && status >= 400 && status !== 404) {
					logger.error(`Replacing SSE topics failed (${status})`);
				}
				// 404 = the server lost the connection though the stream looks open; a new one replays the topics
				if (status === null || status === 404 || status >= 500) {
					reopenAfterFailure();
					break;
				}
				markSynced(topicsKey);
			}
		} finally {
			syncing = false;
		}
	};

	const markSynced = (topicsKey: string) => {
		syncedTopicsKey = topicsKey;
		failedReopens = 0;
	};

	const openSource = () => {
		lastMessageAt = Date.now();
		source = deps.openEventSource({
			onMessage: handleMessage,
			onError: handleError,
		});
	};

	const closeSource = () => {
		source?.close();
		source = null;
		connectionId = null;
		syncedTopicsKey = null;
	};

	const reopenNow = () => {
		closeSource();
		setReadyState("CONNECTING");
		openSource();
	};

	const reopenAfterFailure = () => {
		closeSource();
		setReadyState("CONNECTING");
		if (scheduledReopen !== null) return;

		// jittered so clients failing together during a deploy don't retry at once
		const delay =
			Math.min(REOPEN_MAX_DELAY_MS, REOPEN_BASE_DELAY_MS * 2 ** failedReopens) *
			(0.5 + Math.random() / 2);
		failedReopens++;
		scheduledReopen = setTimeout(() => {
			scheduledReopen = null;
			openSource();
		}, delay);
	};

	const checkLiveness = () => {
		if (!source) return;
		if (Date.now() - lastMessageAt < SILENT_CONNECTION_TIMEOUT_MS) return;

		reopenNow();
	};

	const handleError = (permanent: boolean) => {
		if (!source) return;

		if (permanent) {
			reopenAfterFailure();
			return;
		}

		connectionId = null;
		syncedTopicsKey = null;
		setReadyState("CONNECTING");
	};

	const handleMessage = (data: string) => {
		lastMessageAt = Date.now();

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
		if (event.kind === "heartbeat") return;

		for (const listener of eventListeners) {
			listener(event);
		}
	};

	return {
		connect: () => {
			if (active) return;
			active = true;

			setReadyState("CONNECTING");
			openSource();
			livenessCheck = setInterval(checkLiveness, LIVENESS_CHECK_INTERVAL_MS);
		},
		disconnect: () => {
			if (!active) return;
			active = false;

			if (livenessCheck !== null) clearInterval(livenessCheck);
			livenessCheck = null;
			if (scheduledReopen !== null) clearTimeout(scheduledReopen);
			scheduledReopen = null;
			failedReopens = 0;

			closeSource();
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
		eventSource.addEventListener("error", () =>
			handlers.onError(eventSource.readyState === EventSource.CLOSED),
		);
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
