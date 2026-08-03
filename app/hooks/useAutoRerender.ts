import * as React from "react";

interface AutoRerenderOptions {
	alignTo: Date;
}

const EVERY_TO_MS = {
	second: 1000,
	"ten seconds": 10_000,
	minute: 60_000,
} as const;

interface TickStore {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => number;
}

const tickStores = new Map<string, TickStore>();

function getTickStore(everyMs: number, alignToMs: number): TickStore {
	const key = `${everyMs}:${alignToMs}`;
	const existing = tickStores.get(key);
	if (existing) return existing;

	const listeners = new Set<() => void>();
	let timeout: ReturnType<typeof setTimeout>;

	const scheduleNextTick = () => {
		const elapsed = Date.now() - alignToMs;
		const remainder = ((elapsed % everyMs) + everyMs) % everyMs;
		timeout = setTimeout(() => {
			for (const listener of listeners) {
				listener();
			}
			scheduleNextTick();
		}, everyMs - remainder);
	};

	const store: TickStore = {
		subscribe(listener) {
			listeners.add(listener);
			if (listeners.size === 1) scheduleNextTick();
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0) {
					clearTimeout(timeout);
					tickStores.delete(key);
				}
			};
		},
		getSnapshot: () => Math.floor((Date.now() - alignToMs) / everyMs),
	};
	tickStores.set(key, store);
	return store;
}

/**
 * Forces the component to rerender periodically. Returns the `Date` of the
 * latest tick — callers should consume this value (e.g. pass it to date-fns)
 * so React Compiler can see the state is observable and won't memoize the
 * rerender away.
 *
 * Backed by a shared tick store: all components subscribed to the same
 * interval (and `alignTo` reference time) share a single timer. Ticks are
 * aligned via a self-rescheduling `setTimeout`, so with `every: "minute"` the
 * component rerenders at exactly `alignTo + N*60s` rather than at arbitrary
 * offsets from mount.
 */
export function useAutoRerender(): Date;
export function useAutoRerender(every: "second" | "ten seconds"): Date;
export function useAutoRerender(
	every: "minute",
	options: AutoRerenderOptions,
): Date;
export function useAutoRerender(
	every: "second" | "ten seconds" | "minute" = "second",
	options?: AutoRerenderOptions,
): Date {
	const everyMs = EVERY_TO_MS[every];
	const alignToMs = options?.alignTo.getTime() ?? 0;

	const store = getTickStore(everyMs, alignToMs);
	const tick = React.useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);

	return new Date(alignToMs + tick * everyMs);
}
