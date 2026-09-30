import { describe, expect, test, vi } from "vitest";
import { createEventsClient } from "./events-client";
import type { ServerEvent } from "./events-types";

function setUpClient({
	replaceTopics,
}: {
	replaceTopics?: (
		connectionId: string,
		topics: string[],
	) => Promise<{ status: number }>;
} = {}) {
	const putCalls: Array<{ connectionId: string; topics: string[] }> = [];
	const putStatuses: number[] = [];
	let handlers: {
		onMessage: (data: string) => void;
		onError: () => void;
	} | null = null;
	let sourceClosed = false;

	const client = createEventsClient({
		openEventSource: (newHandlers) => {
			handlers = newHandlers;
			sourceClosed = false;
			return {
				close: () => {
					sourceClosed = true;
				},
			};
		},
		replaceTopics:
			replaceTopics ??
			(async (connectionId, topics) => {
				putCalls.push({ connectionId, topics });
				return { status: putStatuses.shift() ?? 200 };
			}),
	});

	return {
		client,
		putCalls,
		putStatuses,
		isSourceClosed: () => sourceClosed,
		emitHello: (connectionId: string) =>
			handlers!.onMessage(JSON.stringify({ kind: "hello", connectionId })),
		emitEvent: (event: ServerEvent) =>
			handlers!.onMessage(JSON.stringify(event)),
		emitError: () => handlers!.onError(),
	};
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve));

describe("createEventsClient", () => {
	test("reports CONNECTED once the hello event arrives", () => {
		const { client, emitHello } = setUpClient();

		expect(client.getReadyState()).toBe("CLOSED");
		client.connect();
		expect(client.getReadyState()).toBe("CONNECTING");
		emitHello("c1");
		expect(client.getReadyState()).toBe("CONNECTED");
	});

	test("notifies ready state subscribers on changes", () => {
		const { client, emitHello, emitError } = setUpClient();
		const observedStates: string[] = [];
		client.subscribeToReadyState(() =>
			observedStates.push(client.getReadyState()),
		);

		client.connect();
		emitHello("c1");
		emitError();
		client.disconnect();

		expect(observedStates).toEqual([
			"CONNECTING",
			"CONNECTED",
			"CONNECTING",
			"CLOSED",
		]);
	});

	test("dispatches server events to listeners but not the hello", () => {
		const { client, emitHello, emitEvent } = setUpClient();
		const events: ServerEvent[] = [];
		client.addEventListener((event) => events.push(event));

		client.connect();
		emitHello("c1");
		emitEvent({ kind: "roomsChanged" });

		expect(events).toEqual([{ kind: "roomsChanged" }]);
	});

	test("does not PUT for a fresh connection with no desired topics", async () => {
		const { client, putCalls, emitHello } = setUpClient();

		client.connect();
		emitHello("c1");
		await flushAsync();

		expect(putCalls).toHaveLength(0);
	});

	test("replays desired topics on every hello", async () => {
		const { client, putCalls, emitHello, emitError } = setUpClient();
		client.subscribeTopic("tournament__5");

		client.connect();
		emitHello("c1");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));
		expect(putCalls[0]).toEqual({
			connectionId: "c1",
			topics: ["tournament__5"],
		});

		emitError();
		emitHello("c2");
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1]).toEqual({
			connectionId: "c2",
			topics: ["tournament__5"],
		});
	});

	test("replaces the topic set when topics change while connected", async () => {
		const { client, putCalls, emitHello } = setUpClient();
		const unsubscribe = client.subscribeTopic("tournament__5");
		client.connect();
		emitHello("c1");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));

		client.subscribeTopic("match__9");
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1].topics).toEqual(["match__9", "tournament__5"]);

		unsubscribe();
		await vi.waitFor(() => expect(putCalls).toHaveLength(3));
		expect(putCalls[2].topics).toEqual(["match__9"]);
	});

	test("PUTs an empty set when the last topic unsubscribes", async () => {
		const { client, putCalls, emitHello } = setUpClient();
		const unsubscribe = client.subscribeTopic("tournament__5");
		client.connect();
		emitHello("c1");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));

		unsubscribe();
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1].topics).toEqual([]);
	});

	test("keeps the topic while another subscriber remains", async () => {
		const { client, putCalls, emitHello } = setUpClient();
		const unsubscribeFirst = client.subscribeTopic("tournament__5");
		client.subscribeTopic("tournament__5");
		client.connect();
		emitHello("c1");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));

		unsubscribeFirst();
		unsubscribeFirst();
		await flushAsync();

		expect(putCalls).toHaveLength(1);
	});

	test("coalesces same-tick topic changes into one PUT", async () => {
		const { client, putCalls, emitHello } = setUpClient();
		client.connect();
		emitHello("c1");
		await flushAsync();

		client.subscribeTopic("tournament__5");
		client.subscribeTopic("match__9");
		await flushAsync();

		expect(putCalls).toHaveLength(1);
		expect(putCalls[0].topics).toEqual(["match__9", "tournament__5"]);
	});

	test("a PUT that 404s against a dead connection is repaired by the next hello", async () => {
		const { client, putCalls, putStatuses, emitHello } = setUpClient();
		client.connect();
		emitHello("c1");

		putStatuses.push(404);
		client.subscribeTopic("tournament__5");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));

		emitHello("c2");
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1]).toEqual({
			connectionId: "c2",
			topics: ["tournament__5"],
		});
	});

	test("sends the latest set after an in-flight PUT resolves instead of interleaving", async () => {
		const resolvers: Array<(result: { status: number }) => void> = [];
		const putCalls: Array<string[]> = [];
		const { client, emitHello } = setUpClient({
			replaceTopics: (_connectionId, topics) => {
				putCalls.push(topics);
				return new Promise((resolve) => resolvers.push(resolve));
			},
		});
		client.connect();
		emitHello("c1");

		client.subscribeTopic("tournament__5");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));

		client.subscribeTopic("match__9");
		await flushAsync();
		expect(putCalls).toHaveLength(1);

		resolvers[0]({ status: 200 });
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1]).toEqual(["match__9", "tournament__5"]);
	});

	test("disconnect closes the source and keeps desired topics for the next connect", async () => {
		const { client, putCalls, isSourceClosed, emitHello } = setUpClient();
		client.subscribeTopic("tournament__5");
		client.connect();
		emitHello("c1");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));

		client.disconnect();
		expect(isSourceClosed()).toBe(true);
		expect(client.getReadyState()).toBe("CLOSED");

		client.connect();
		emitHello("c2");
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1]).toEqual({
			connectionId: "c2",
			topics: ["tournament__5"],
		});
	});
});
