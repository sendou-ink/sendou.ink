import { logger } from "./logger";

/** `fetch` that aborts after `timeout` ms, also honoring a caller supplied `init.signal`. */
export async function fetchWithTimeout(
	input: RequestInfo | URL,
	init?: RequestInit | undefined,
	timeout = 5000,
) {
	const timeoutSignal = AbortSignal.timeout(timeout);
	const signal = init?.signal
		? AbortSignal.any([init.signal, timeoutSignal])
		: timeoutSignal;

	try {
		return await fetch(input, { ...init, signal });
	} catch (error) {
		if (timeoutSignal.aborted) {
			logger.error("Fetch timed out");
		}
		throw error;
	}
}
