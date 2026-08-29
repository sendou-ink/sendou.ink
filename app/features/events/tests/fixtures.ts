import * as EventBus from "../core/EventBus.server";
import type { ServerEvent } from "../events-types";

const abortControllers: AbortController[] = [];

/** Collects the channel's published events into the returned array; release with {@link abortSubscriptions} in `afterEach`. */
export function subscribeTo(channel: string) {
	const controller = new AbortController();
	abortControllers.push(controller);

	const received: ServerEvent[] = [];
	void (async () => {
		for await (const event of EventBus.subscribe(
			[channel],
			controller.signal,
		)) {
			received.push(event);
		}
	})();
	return received;
}

/** Aborts every subscription opened via {@link subscribeTo}. */
export function abortSubscriptions() {
	for (const controller of abortControllers) {
		controller.abort();
	}
	abortControllers.length = 0;
}

/** Lets queued EventBus deliveries drain. */
export function flushEvents() {
	return new Promise<void>((resolve) => setTimeout(resolve));
}
