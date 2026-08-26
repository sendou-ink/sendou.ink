import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import type * as UserFactory from "~/db/seed/factories/UserFactory";
import * as EventBus from "~/features/events/core/EventBus.server";
import type { ServerEvent } from "~/features/events/events-types";

/** SendouQ match between pool users 2-5 (alpha) and 6-9 (bravo), the owner of the chat rooms the tests exercise. */
export async function setupSqMatch(users: ReturnType<typeof UserFactory.pool>) {
	const alphaUserIds = [users.id(2), users.id(3), users.id(4), users.id(5)];
	const bravoUserIds = [users.id(6), users.id(7), users.id(8), users.id(9)];

	const match = await SQMatchFactory.create({ alphaUserIds, bravoUserIds });

	return { match, alphaUserIds, bravoUserIds };
}

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
