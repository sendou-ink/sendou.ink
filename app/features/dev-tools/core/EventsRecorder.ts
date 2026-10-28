import {
	type EventsReadyState,
	eventsClient,
} from "~/features/events/events-client";
import type { ServerEvent } from "~/features/events/events-types";

const MAX_ENTRIES = 300;

export type RecordedEvent =
	| { id: number; at: number; type: "event"; event: ServerEvent }
	| { id: number; at: number; type: "connection"; state: EventsReadyState };

let entries: RecordedEvent[] = [];
let nextId = 1;
let isInstalled = false;
const listeners = new Set<() => void>();

/** Starts recording the server events the page's SSE connection receives and its connection state changes. Idempotent. */
export function install() {
	if (isInstalled) return;
	isInstalled = true;

	eventsClient.addEventListener((event) => record({ type: "event", event }));
	eventsClient.subscribeToReadyState(() =>
		record({ type: "connection", state: eventsClient.getReadyState() }),
	);
}

/** Recorded entries, newest first. */
export function getSnapshot() {
	return entries;
}

/** For `useSyncExternalStore`. Returns an unsubscribe function. */
export function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Forgets every recorded entry. */
export function clear() {
	entries = [];
	emit();
}

function record(
	entry:
		| { type: "event"; event: ServerEvent }
		| { type: "connection"; state: EventsReadyState },
) {
	entries = [{ ...entry, id: nextId++, at: Date.now() }, ...entries].slice(
		0,
		MAX_ENTRIES,
	);
	emit();
}

function emit() {
	for (const listener of listeners) {
		listener();
	}
}
