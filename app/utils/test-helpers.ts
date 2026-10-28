import { vi } from "bun:test";

const DEFAULT_WAIT_FOR_TIMEOUT_MS = 1000;
const DEFAULT_WAIT_FOR_INTERVAL_MS = 50;
const MAX_TIMER_ROUNDS = 100;

/**
 * Retries `callback` until it stops throwing (returning its result) or the timeout runs out (rethrowing its last error).
 * Under fake timers every retry advances them by the interval.
 */
export async function waitFor<T>(
	callback: () => T | Promise<T>,
	{
		timeout = DEFAULT_WAIT_FOR_TIMEOUT_MS,
		interval = DEFAULT_WAIT_FOR_INTERVAL_MS,
	} = {},
): Promise<T> {
	const deadline = performance.now() + timeout;

	while (true) {
		try {
			return await callback();
		} catch (error) {
			if (performance.now() > deadline) throw error;
		}

		if (vi.isFakeTimers()) {
			vi.advanceTimersByTime(interval);
			await settle();
		} else {
			await new Promise((resolve) => setTimeout(resolve, interval));
		}
	}
}

/** Advances fake timers by `ms`, then lets the promise chains the fired timers started settle. */
export async function advanceTimersByTimeAsync(ms: number) {
	await settle();
	vi.advanceTimersByTime(ms);
	await settle();
}

/** Runs every pending fake timer, including the ones scheduled by promise chains the earlier ones started. */
export async function runAllTimersAsync() {
	await settle();
	for (
		let round = 0;
		round < MAX_TIMER_ROUNDS && vi.getTimerCount() > 0;
		round++
	) {
		vi.runAllTimers();
		await settle();
	}
}

// setImmediate is not faked, so awaiting it runs every queued microtask and pending I/O callback
function settle() {
	return new Promise((resolve) => setImmediate(resolve));
}

/** Replaces the global `fetch` until `vi.restoreAllMocks()`. */
export function mockFetch(
	implementation: (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => Promise<Response>,
) {
	// Bun's `typeof fetch` also has `fetch.preconnect`
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(implementation as typeof fetch);
}
