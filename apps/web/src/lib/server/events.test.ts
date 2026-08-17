import { describe, expect, test } from "vitest";
import * as Events from "./events.ts";

describe("Events.subscribe", () => {
	test("yields once per publish", async () => {
		const iterator = Events.subscribe("test-1", {
			heartbeatMs: Number.POSITIVE_INFINITY,
		});

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
		const iterator = Events.subscribe("test-2", {
			heartbeatMs: Number.POSITIVE_INFINITY,
		});

		const first = iterator.next();
		await waitForSubscriber("test-2");
		Events.publish("test-2");
		Events.publish("test-2");
		Events.publish("test-2");
		await first;

		// all three publishes collapsed into that one yield, so the next
		// next() must block until a fresh publish
		let resolved = false;
		const blocked = iterator.next().then((result) => {
			resolved = true;
			return result;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(resolved).toBe(false);

		Events.publish("test-2");
		expect((await blocked).done).toBe(false);

		await iterator.return(undefined);
	});

	test("wakes on the heartbeat interval without a publish", async () => {
		const iterator = Events.subscribe("test-3", { heartbeatMs: 5 });

		expect((await iterator.next()).done).toBe(false);

		await iterator.return(undefined);
	});

	test("unsubscribes when the consumer stops iterating", async () => {
		const iterator = Events.subscribe("test-4", {
			heartbeatMs: Number.POSITIVE_INFINITY,
		});

		const first = iterator.next();
		await waitForSubscriber("test-4");
		expect(Events.subscriberCount("test-4")).toBe(1);

		Events.publish("test-4");
		await first;
		await iterator.return(undefined);

		expect(Events.subscriberCount("test-4")).toBe(0);
	});

	test("publishing to a channel with no subscribers is a no-op", () => {
		expect(() => Events.publish("test-5")).not.toThrow();
	});
});

async function waitForSubscriber(channel: string) {
	while (Events.subscriberCount(channel) === 0) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}
