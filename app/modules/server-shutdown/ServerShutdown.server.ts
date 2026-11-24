/**
 * Stopping the server process, as every deploy does. The HTTP server only stops once its responses have ended, and
 * the server-sent event streams never end by themselves: left alone, the old process keeps them open (heartbeats
 * included) while refusing every new request, so its clients look connected but can do nothing. Each stream
 * registers how to end itself here, and they are all ended as the process is told to stop.
 */
import { logger } from "~/utils/logger";

/** Time the requests in flight get to finish once the streams have ended. */
const EXIT_GRACE_MS = 1_000;

declare global {
	var __serverShutdownCallbacks: Set<() => void> | undefined;
	var __serverExitsOnSignals: true | undefined;
}

// on globalThis so the streams opened before the dev server evaluated this module again are found
globalThis.__serverShutdownCallbacks ??= new Set();
const callbacks = globalThis.__serverShutdownCallbacks;

/** Runs the callback as the server shuts down, e.g. to end a stream. Returns a function unregistering it. */
export function onShutdown(callback: () => void) {
	callbacks.add(callback);

	return () => {
		callbacks.delete(callback);
	};
}

/**
 * Runs every registered shutdown callback once.
 * @internal
 */
export function shutdown() {
	for (const callback of Array.from(callbacks)) {
		callbacks.delete(callback);
		try {
			callback();
		} catch (error) {
			logger.error("Shutdown callback failed", error);
		}
	}
}

/**
 * Shuts down on SIGTERM and SIGINT, then exits once the requests in flight had a moment to finish. Called once per
 * process, the server's own handler closing the HTTP server alongside.
 */
export function exitOnSignals() {
	if (globalThis.__serverExitsOnSignals) return;
	globalThis.__serverExitsOnSignals = true;

	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.once(signal, () => {
			logger.info(`${signal} received, ending the open streams and exiting`);
			shutdown();
			setTimeout(() => process.exit(0), EXIT_GRACE_MS);
		});
	}
}
