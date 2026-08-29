import * as React from "react";
import {
	type EventsReadyState,
	eventsClient,
} from "~/features/events/events-client";
import type { ServerEvent } from "~/features/events/events-types";

// how long the tab must have been hidden for returning to it to be worth a catch-up
const CATCH_UP_HIDDEN_MS = 20 * 1000;
// how often to catch up while the event stream is down and nothing can arrive over it
const EVENTS_DOWN_CATCH_UP_MS = 2 * 60 * 1000;
// spreads out the catch-ups of the many clients that reconnect at once after a deploy
const CATCH_UP_MAX_JITTER_MS = 3_000;
// a first connect slower than this did not happen as part of page load, so what was
// published between the two can only be caught up on
const LATE_FIRST_CONNECT_MS = 2_000;

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

/**
 * Calls `onCatchUp` whenever events may have been missed: the stream came back up, the
 * tab was returned to after being hidden long enough, or the stream is down and nothing
 * can arrive over it at all. Returns the same trigger for callers that have a reason of
 * their own to catch up.
 *
 * Every catch-up is jittered so the clients that reconnect together after a deploy do
 * not all refetch in the same instant, and one triggered while another is already
 * scheduled is absorbed into it.
 */
export function useEventStreamCatchUp({
	enabled,
	onCatchUp,
}: {
	enabled: boolean;
	onCatchUp: () => void;
}) {
	const readyState = useEventsReadyState();
	const latestOnCatchUp = React.useRef(onCatchUp);
	latestOnCatchUp.current = onCatchUp;
	const scheduledRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	// stable so the effects below keep their listeners across renders
	const catchUp = React.useCallback(() => {
		if (scheduledRef.current !== null) return;

		scheduledRef.current = setTimeout(() => {
			scheduledRef.current = null;
			latestOnCatchUp.current();
		}, Math.random() * CATCH_UP_MAX_JITTER_MS);
	}, []);

	React.useEffect(
		() => () => {
			if (scheduledRef.current !== null) {
				clearTimeout(scheduledRef.current);
			}
		},
		[],
	);

	useCatchUpOnConnect(enabled, readyState, catchUp);

	React.useEffect(() => {
		if (!enabled) return;

		let hiddenAt: number | null = null;

		const handleVisibilityChange = () => {
			if (document.visibilityState !== "visible") {
				hiddenAt = Date.now();
				return;
			}

			// a quick tab away can not have missed anything the stream would not
			// still deliver, and catching up for it would be pure server load
			if (hiddenAt !== null && Date.now() - hiddenAt >= CATCH_UP_HIDDEN_MS) {
				catchUp();
			}
			hiddenAt = null;
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [enabled, catchUp]);

	React.useEffect(() => {
		if (!enabled || readyState === "CONNECTED") return;

		const interval = setInterval(catchUp, EVENTS_DOWN_CATCH_UP_MS);
		return () => clearInterval(interval);
	}, [enabled, readyState, catchUp]);

	return catchUp;
}

/**
 * Calls `onConnect` every time the event stream comes up, skipping a first connect
 * that page load itself waited for: only what happened while nothing was listening
 * needs catching up on. A first connect that took longer than that left a window
 * whose events reach the page no other way.
 */
function useCatchUpOnConnect(
	enabled: boolean,
	readyState: EventsReadyState,
	onConnect: () => void,
) {
	const hasConnectedRef = React.useRef(false);
	const listeningSinceRef = React.useRef<number | null>(null);

	React.useEffect(() => {
		// while disabled nothing can be missed, so the wait for the connect that
		// follows starts over from the moment listening resumes
		if (!enabled) {
			listeningSinceRef.current = null;
			return;
		}
		listeningSinceRef.current ??= Date.now();

		if (readyState !== "CONNECTED") return;

		const isFirstConnect = !hasConnectedRef.current;
		hasConnectedRef.current = true;
		if (
			isFirstConnect &&
			Date.now() - listeningSinceRef.current < LATE_FIRST_CONNECT_MS
		) {
			return;
		}

		onConnect();
	}, [enabled, readyState, onConnect]);
}

const getServerReadyState = (): EventsReadyState => "CLOSED";
