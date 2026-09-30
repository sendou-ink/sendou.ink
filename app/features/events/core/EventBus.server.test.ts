import { describe, expect, test } from "vitest";
import type { ServerEvent } from "../events-types";
import * as EventBus from "./EventBus.server";

const chatMessageEvent = (contents: string): ServerEvent => ({
	kind: "chatMessage",
	roomId: 1,
	message: {
		id: 1,
		roomId: 1,
		authorUserId: null,
		type: null,
		contents,
		publicId: contents,
		createdAt: 0,
		author: null,
	},
});

function collect(iterable: AsyncIterable<ServerEvent>) {
	const received: ServerEvent[] = [];
	const done = (async () => {
		for await (const event of iterable) {
			received.push(event);
		}
	})();
	return { received, done };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

describe("EventBus.publish", () => {
	test("fans out to subscribers on every published channel", async () => {
		const abortController = new AbortController();
		const alpha = collect(
			EventBus.subscribe(["fanout-a"], abortController.signal),
		);
		const bravo = collect(
			EventBus.subscribe(["fanout-b"], abortController.signal),
		);

		EventBus.publish(["fanout-a", "fanout-b"], { kind: "roomsChanged" });
		await flush();

		expect(alpha.received).toEqual([{ kind: "roomsChanged" }]);
		expect(bravo.received).toEqual([{ kind: "roomsChanged" }]);

		abortController.abort();
		await Promise.all([alpha.done, bravo.done]);
	});

	test("delivers once to a subscriber listening on several published channels", async () => {
		const abortController = new AbortController();
		const subscription = collect(
			EventBus.subscribe(["dedupe-a", "dedupe-b"], abortController.signal),
		);

		EventBus.publish(["dedupe-a", "dedupe-b"], { kind: "roomsChanged" });
		await flush();

		expect(subscription.received).toHaveLength(1);

		abortController.abort();
		await subscription.done;
	});

	test("does not deliver events published to other channels", async () => {
		const abortController = new AbortController();
		const subscription = collect(
			EventBus.subscribe(["leak-mine"], abortController.signal),
		);

		EventBus.publish(["leak-other"], { kind: "notificationsChanged" });
		await flush();

		expect(subscription.received).toEqual([]);

		abortController.abort();
		await subscription.done;
	});

	test("delivers to every subscriber of the same channel", async () => {
		const abortController = new AbortController();
		const alpha = collect(
			EventBus.subscribe(["shared"], abortController.signal),
		);
		const bravo = collect(
			EventBus.subscribe(["shared"], abortController.signal),
		);

		EventBus.publish(["shared"], { kind: "notificationsChanged" });
		await flush();

		expect(alpha.received).toEqual([{ kind: "notificationsChanged" }]);
		expect(bravo.received).toEqual([{ kind: "notificationsChanged" }]);

		abortController.abort();
		await Promise.all([alpha.done, bravo.done]);
	});

	test("publishing to a channel with no subscribers is a no-op", () => {
		expect(() =>
			EventBus.publish(["nobody-home"], { kind: "roomsChanged" }),
		).not.toThrow();
	});

	test("queues events for a slow consumer and delivers them in order", async () => {
		const abortController = new AbortController();
		const iterator = EventBus.subscribe(["slow"], abortController.signal)[
			Symbol.asyncIterator
		]();

		EventBus.publish(["slow"], chatMessageEvent("first"));
		EventBus.publish(["slow"], chatMessageEvent("second"));
		EventBus.publish(["slow"], chatMessageEvent("third"));

		expect((await iterator.next()).value).toEqual(chatMessageEvent("first"));
		expect((await iterator.next()).value).toEqual(chatMessageEvent("second"));
		expect((await iterator.next()).value).toEqual(chatMessageEvent("third"));

		abortController.abort();
		expect((await iterator.next()).done).toBe(true);
	});
});

describe("EventBus.subscribe", () => {
	test("registers for each channel and unregisters every one on abort", async () => {
		const abortController = new AbortController();
		const subscription = collect(
			EventBus.subscribe(["cleanup-a", "cleanup-b"], abortController.signal),
		);

		expect(EventBus.subscriberCount("cleanup-a")).toBe(1);
		expect(EventBus.subscriberCount("cleanup-b")).toBe(1);

		abortController.abort();
		await subscription.done;

		expect(EventBus.subscriberCount("cleanup-a")).toBe(0);
		expect(EventBus.subscriberCount("cleanup-b")).toBe(0);

		EventBus.publish(["cleanup-a"], { kind: "roomsChanged" });
		await flush();
		expect(subscription.received).toEqual([]);
	});

	test("drops events still queued when the signal aborts", async () => {
		const abortController = new AbortController();
		const iterable = EventBus.subscribe(["dropped"], abortController.signal);

		EventBus.publish(["dropped"], chatMessageEvent("never seen"));
		abortController.abort();

		const subscription = collect(iterable);
		await subscription.done;
		expect(subscription.received).toEqual([]);
	});

	test("unregisters when the consumer stops iterating", async () => {
		const abortController = new AbortController();
		const iterable = EventBus.subscribe(["walk-away"], abortController.signal);

		EventBus.publish(["walk-away"], chatMessageEvent("only one"));
		for await (const event of iterable) {
			expect(event).toEqual(chatMessageEvent("only one"));
			break;
		}

		expect(EventBus.subscriberCount("walk-away")).toBe(0);
	});

	test("completes immediately without registering for an already aborted signal", async () => {
		const abortController = new AbortController();
		abortController.abort();

		const subscription = collect(
			EventBus.subscribe(["stillborn"], abortController.signal),
		);
		await subscription.done;

		expect(subscription.received).toEqual([]);
		expect(EventBus.subscriberCount("stillborn")).toBe(0);
	});

	test("wakes a consumer waiting for its next event", async () => {
		const abortController = new AbortController();
		const subscription = collect(
			EventBus.subscribe(["wake-up"], abortController.signal),
		);
		await flush();

		EventBus.publish(["wake-up"], chatMessageEvent("hello"));
		await flush();

		expect(subscription.received).toEqual([chatMessageEvent("hello")]);

		abortController.abort();
		await subscription.done;
	});
});
