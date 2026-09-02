import * as React from "react";
import {
	type EventsReadyState,
	eventsClient,
} from "~/features/events/events-client";
import type { ServerEvent } from "~/features/events/events-types";

// how long the page must have been away for coming back to it to be worth a catch-up
const CATCH_UP_AWAY_MS = 20 * 1000;
// foreground heartbeat; an absence is measured by the gap in these ticks, so this bounds how much of one goes unnoticed
const FOREGROUND_TICK_MS = 5 * 1000;
// how often to catch up while the event stream is down and nothing can arrive over it
const EVENTS_DOWN_CATCH_UP_MS = 2 * 60 * 1000;
// spreads out the catch-ups of the many clients that reconnect at once after a deploy
const CATCH_UP_MAX_JITTER_MS = 3_000;
// a first connect slower than this was not part of page load, so what was published in between must be caught up on
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
 * Calls `onCatchUp` whenever events may have been missed: the stream came back up, the page
 * returned after being away long enough, or the stream is down. Returns the trigger for callers
 * with reasons of their own. Catch-ups are jittered so clients reconnecting together after a
 * deploy don't refetch at once; one triggered while another is scheduled is absorbed into it.
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

		return subscribeToPageReturn(catchUp);
	}, [enabled, catchUp]);

	React.useEffect(() => {
		if (!enabled || readyState === "CONNECTED") return;

		const interval = setInterval(catchUp, EVENTS_DOWN_CATCH_UP_MS);
		return () => clearInterval(interval);
	}, [enabled, readyState, catchUp]);

	return catchUp;
}

/**
 * Calls `onConnect` every time the stream comes up, skipping a first connect page load itself
 * waited for: only what happened while nothing was listening needs catching up on.
 */
function useCatchUpOnConnect(
	enabled: boolean,
	readyState: EventsReadyState,
	onConnect: () => void,
) {
	const hasConnectedRef = React.useRef(false);
	const listeningSinceRef = React.useRef<number | null>(null);

	React.useEffect(() => {
		// while disabled nothing can be missed, so the wait for the next connect restarts when listening resumes
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

const returnListeners = new Set<() => void>();
let foregroundTicker: ReturnType<typeof setInterval> | null = null;
let lastForegroundTickAt = 0;

/**
 * Notifies listeners when the page comes back from being away long enough (backgrounded tab,
 * suspended app, sleeping device) that the stream can't be trusted to have delivered everything.
 * Time away is the gap between foreground heartbeat ticks, since a suspended page never gets
 * the transition to hidden a return could otherwise be measured against. Returns an unsubscribe.
 */
function subscribeToPageReturn(listener: () => void) {
	returnListeners.add(listener);
	if (returnListeners.size === 1) {
		lastForegroundTickAt = Date.now();
		foregroundTicker = setInterval(noticeReturn, FOREGROUND_TICK_MS);
		document.addEventListener("visibilitychange", noticeReturn);
		// bfcache restores resume the page without a visibility change of their own
		window.addEventListener("pageshow", noticeReturn);
	}

	return () => {
		returnListeners.delete(listener);
		if (returnListeners.size > 0) return;

		if (foregroundTicker !== null) clearInterval(foregroundTicker);
		foregroundTicker = null;
		document.removeEventListener("visibilitychange", noticeReturn);
		window.removeEventListener("pageshow", noticeReturn);
	};
}

function noticeReturn() {
	if (document.visibilityState !== "visible") return;

	const awayFor = Date.now() - lastForegroundTickAt;
	lastForegroundTickAt = Date.now();

	// a quick tab away misses nothing the stream won't still deliver; catching up would be pure server load
	if (awayFor < CATCH_UP_AWAY_MS) return;

	for (const listener of returnListeners) {
		listener();
	}
}

const getServerReadyState = (): EventsReadyState => "CLOSED";
