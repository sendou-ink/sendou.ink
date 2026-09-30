import * as React from "react";

interface CooldownStore {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => number;
	getServerSnapshot: () => number;
}

const cooldownStores = new Map<number, CooldownStore>();

function secondsLeftAt(until: number, now: number) {
	return Math.max(0, Math.ceil((until - now) / 1000));
}

function getCooldownStore(until: number): CooldownStore {
	const existing = cooldownStores.get(until);
	if (existing) return existing;

	const initialSecondsLeft = secondsLeftAt(until, Date.now());
	let secondsLeft = initialSecondsLeft;
	const listeners = new Set<() => void>();
	let timeout: ReturnType<typeof setTimeout> | undefined;

	const scheduleNextTick = () => {
		const now = Date.now();
		if (now >= until) return;

		const msIntoSecond = ((until - now) % 1000) + 1;
		timeout = setTimeout(() => {
			secondsLeft = secondsLeftAt(until, Date.now());
			for (const listener of listeners) {
				listener();
			}
			scheduleNextTick();
		}, msIntoSecond);
	};

	const store: CooldownStore = {
		subscribe(listener) {
			listeners.add(listener);
			if (listeners.size === 1) {
				secondsLeft = secondsLeftAt(until, Date.now());
				scheduleNextTick();
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0) {
					clearTimeout(timeout);
					cooldownStores.delete(until);
				}
			};
		},
		getSnapshot: () => secondsLeft,
		getServerSnapshot: () => initialSecondsLeft,
	};
	cooldownStores.set(until, store);
	return store;
}

const noopStore: CooldownStore = {
	subscribe: () => () => {},
	getSnapshot: () => 0,
	getServerSnapshot: () => 0,
};

export function useCooldown(until: number | null): number {
	const store = until === null ? noopStore : getCooldownStore(until);

	return React.useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getServerSnapshot,
	);
}
