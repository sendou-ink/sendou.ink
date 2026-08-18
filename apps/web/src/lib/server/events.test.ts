import { describe, expect, test } from "vitest";
import * as Events from "./events.ts";

const neverAborts = () => new AbortController().signal;

describe("Events.subscribe", () => {
	test("yields once per publish", async () => {
		const iterator = Events.subscribe("test-1", { signal: neverAborts() });

		const first = iterator.next();
		await waitForSubscriber("test-1");
		Events.publish("test-1");
		expect((await first).done).toBe(false);

		const second = iterator.next();
		Events.publish("test-1");
		expect((await second).done).toBe(false);

		await iterator.return(undefined);
	});

	test("coalesces publishes that land before the consumer resumes", async () => {
		const iterator = Events.subscribe("test-2", { signal: neverAborts() });

		const first = iterator.next();
		await waitForSubscriber("test-2");
		Events.publish("test-2");
		Events.publish("test-2");
		Events.publish("test-2");
		await first;

		// all three publishes collapsed into that one yield, so the next
		// next() must block until a fresh publish
		expect(await blocksFor(iterator.next())).toBe(true);

		Events.publish("test-2");
		await iterator.return(undefined);
	});

	test("never wakes on its own without a wakeAt deadline", async () => {
		const iterator = Events.subscribe("test-3", { signal: neverAborts() });

		expect(await blocksFor(iterator.next())).toBe(true);

		Events.publish("test-3");
		await iterator.return(undefined);
	});

	test("wakes at the wakeAt deadline without a publish", async () => {
		const iterator = Events.subscribe("test-4", {
			signal: neverAborts(),
			wakeAt: () => new Date(Date.now() + 5),
		});

		expect((await iterator.next()).done).toBe(false);

		await iterator.return(undefined);
	});

	test("ignores a wakeAt deadline that already passed", async () => {
		const iterator = Events.subscribe("test-5", {
			signal: neverAborts(),
			wakeAt: () => new Date(Date.now() - 60_000),
		});

		expect(await blocksFor(iterator.next())).toBe(true);

		Events.publish("test-5");
		await iterator.return(undefined);
	});

	test("re-reads wakeAt before every sleep", async () => {
		const deadlines: (Date | null)[] = [null, new Date(Date.now() + 5)];
		let call = 0;

		const iterator = Events.subscribe("test-6", {
			signal: neverAborts(),
			wakeAt: () => deadlines[call++] ?? null,
		});

		const first = iterator.next();
		await waitForSubscriber("test-6");
		Events.publish("test-6");
		await first;

		// the second sleep gets the deadline, so no publish is needed
		expect((await iterator.next()).done).toBe(false);
		expect(call).toBe(2);

		await iterator.return(undefined);
	});

	test("unsubscribes when the consumer stops iterating", async () => {
		const iterator = Events.subscribe("test-7", { signal: neverAborts() });

		const first = iterator.next();
		await waitForSubscriber("test-7");
		expect(Events.subscriberCount("test-7")).toBe(1);

		Events.publish("test-7");
		await first;
		await iterator.return(undefined);

		expect(Events.subscriberCount("test-7")).toBe(0);
	});

	test("ends and unsubscribes when the signal aborts mid-sleep", async () => {
		const controller = new AbortController();
		const iterator = Events.subscribe("test-8", { signal: controller.signal });

		const first = iterator.next();
		await waitForSubscriber("test-8");
		controller.abort();

		expect((await first).done).toBe(true);
		expect(Events.subscriberCount("test-8")).toBe(0);
	});

	test("never starts when the signal aborted beforehand", async () => {
		const controller = new AbortController();
		controller.abort();

		const iterator = Events.subscribe("test-9", { signal: controller.signal });

		expect((await iterator.next()).done).toBe(true);
		expect(Events.subscriberCount("test-9")).toBe(0);
	});

	test("publishing to a channel with no subscribers is a no-op", () => {
		expect(() => Events.publish("test-10")).not.toThrow();
	});
});

async function waitForSubscriber(channel: string) {
	while (Events.subscriberCount(channel) === 0) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

async function blocksFor(next: Promise<unknown>) {
	let settled = false;
	next.then(() => {
		settled = true;
	});
	await new Promise((resolve) => setTimeout(resolve, 20));

	return !settled;
}
