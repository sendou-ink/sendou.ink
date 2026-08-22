import * as React from "react";
import {
	type EventsReadyState,
	eventsClient,
} from "~/features/events/events-client";
import type { ServerEvent } from "~/features/events/events-types";

/** Keeps the shared SSE connection open while mounted and enabled. */
export function useEventsConnection(enabled: boolean) {
	React.useEffect(() => {
		if (!enabled) return;

		eventsClient.connect();
		return () => eventsClient.disconnect();
	}, [enabled]);
}

/** Connection state of the shared SSE connection. */
export function useEventsReadyState(): EventsReadyState {
	return React.useSyncExternalStore(
		eventsClient.subscribeToReadyState,
		eventsClient.getReadyState,
		getServerReadyState,
	);
}

/** Calls `listener` for every server event received over the shared SSE connection. */
export function useServerEventListener(listener: (event: ServerEvent) => void) {
	const handleEvent = React.useEffectEvent(listener);

	React.useEffect(() => eventsClient.addEventListener(handleEvent), []);
}

/** Subscribes the shared SSE connection to the topic while mounted and enabled. */
export function useEventsTopic(topic: string, enabled = true) {
	React.useEffect(() => {
		if (!enabled) return;

		return eventsClient.subscribeTopic(topic);
	}, [topic, enabled]);
}

const getServerReadyState = (): EventsReadyState => "CLOSED";
