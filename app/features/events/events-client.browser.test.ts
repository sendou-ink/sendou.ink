import { afterEach, describe, expect, test, vi } from "vitest";
import { createEventsClient } from "./events-client";
import { HEARTBEAT_INTERVAL_MS, type ServerEvent } from "./events-types";

const clients: Array<ReturnType<typeof createEventsClient>> = [];

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
		onError: (permanent: boolean) => void;
	} | null = null;
	let sourceClosed = false;
	let openCount = 0;

	const client = createEventsClient({
		openEventSource: (newHandlers) => {
			handlers = newHandlers;
			openCount++;
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

	clients.push(client);

	return {
		client,
		putCalls,
		putStatuses,
		isSourceClosed: () => sourceClosed,
		openCount: () => openCount,
		emitHello: (connectionId: string) =>
			handlers!.onMessage(JSON.stringify({ kind: "hello", connectionId })),
		emitEvent: (event: ServerEvent) =>
			handlers!.onMessage(JSON.stringify(event)),
		emitHeartbeat: () =>
			handlers!.onMessage(JSON.stringify({ kind: "heartbeat" })),
		emitError: ({ permanent = false } = {}) => handlers!.onError(permanent),
	};
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve));

const MAX_FIRST_REOPEN_DELAY_MS = 1_000;

afterEach(() => {
	for (const client of clients) {
		client.disconnect();
	}
	clients.length = 0;
	vi.useRealTimers();
});

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

	test("does not dispatch heartbeats to listeners", () => {
		const { client, emitHello, emitHeartbeat } = setUpClient();
		const events: ServerEvent[] = [];
		client.addEventListener((event) => events.push(event));

		client.connect();
		emitHello("c1");
		emitHeartbeat();

		expect(events).toEqual([]);
	});

	test("reopens a connection that has gone silent", async () => {
		vi.useFakeTimers();
		const { client, openCount, isSourceClosed, emitHello } = setUpClient();
		client.connect();
		emitHello("c1");

		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);

		expect(openCount()).toBe(2);
		expect(client.getReadyState()).toBe("CONNECTING");
		expect(isSourceClosed()).toBe(false);
	});

	test("keeps a connection receiving heartbeats open", async () => {
		vi.useFakeTimers();
		const { client, openCount, emitHello, emitHeartbeat } = setUpClient();
		client.connect();
		emitHello("c1");

		for (let i = 0; i < 4; i++) {
			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
			emitHeartbeat();
		}

		expect(openCount()).toBe(1);
		expect(client.getReadyState()).toBe("CONNECTED");
	});

	test("reopens a source that gave up on reconnecting", async () => {
		vi.useFakeTimers();
		const { client, openCount, isSourceClosed, emitHello, emitError } =
			setUpClient();
		client.connect();
		emitHello("c1");

		emitError({ permanent: true });
		expect(isSourceClosed()).toBe(true);
		expect(client.getReadyState()).toBe("CONNECTING");

		await vi.advanceTimersByTimeAsync(MAX_FIRST_REOPEN_DELAY_MS);
		expect(openCount()).toBe(2);
	});

	test("leaves reconnecting to the source on a transient error", async () => {
		vi.useFakeTimers();
		const { client, openCount, isSourceClosed, emitHello, emitError } =
			setUpClient();
		client.connect();
		emitHello("c1");

		emitError();
		await vi.advanceTimersByTimeAsync(MAX_FIRST_REOPEN_DELAY_MS);

		expect(isSourceClosed()).toBe(false);
		expect(openCount()).toBe(1);
	});

	test("disconnect cancels a scheduled reopen", async () => {
		vi.useFakeTimers();
		const { client, openCount, emitHello, emitError } = setUpClient();
		client.connect();
		emitHello("c1");

		emitError({ permanent: true });
		client.disconnect();
		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);

		expect(openCount()).toBe(1);
		expect(client.getReadyState()).toBe("CLOSED");
	});

	test.each([
		{ why: "404 (server lost the connection)", status: 404 },
		{ why: "server error", status: 502 },
	])(
		"reopens the connection when the topic PUT fails with a $why",
		async ({ status }) => {
			vi.useFakeTimers();
			const { client, putCalls, putStatuses, openCount, emitHello } =
				setUpClient();
			client.connect();
			emitHello("c1");

			putStatuses.push(status);
			client.subscribeTopic("tournament__5");
			await vi.waitFor(() => expect(putCalls).toHaveLength(1));
			expect(client.getReadyState()).toBe("CONNECTING");

			await vi.advanceTimersByTimeAsync(MAX_FIRST_REOPEN_DELAY_MS);
			expect(openCount()).toBe(2);
			emitHello("c2");
			await vi.waitFor(() => expect(putCalls).toHaveLength(2));
			expect(putCalls[1]).toEqual({
				connectionId: "c2",
				topics: ["tournament__5"],
			});
		},
	);

	test("reopens the connection when the topic PUT does not reach the server", async () => {
		vi.useFakeTimers();
		const putCalls: string[] = [];
		const { client, openCount, emitHello } = setUpClient({
			replaceTopics: async (connectionId) => {
				putCalls.push(connectionId);
				if (connectionId === "c1") throw new TypeError("Failed to fetch");
				return { status: 200 };
			},
		});
		client.connect();
		emitHello("c1");

		client.subscribeTopic("tournament__5");
		await vi.waitFor(() => expect(putCalls).toEqual(["c1"]));
		await vi.advanceTimersByTimeAsync(MAX_FIRST_REOPEN_DELAY_MS);
		expect(openCount()).toBe(2);

		emitHello("c2");
		await vi.waitFor(() => expect(putCalls).toEqual(["c1", "c2"]));
		expect(client.getReadyState()).toBe("CONNECTED");
	});

	test("keeps the connection when the topic PUT is forbidden", async () => {
		const { client, putCalls, putStatuses, openCount, emitHello } =
			setUpClient();
		client.connect();
		emitHello("c1");

		putStatuses.push(403);
		client.subscribeTopic("tournament__5");
		await vi.waitFor(() => expect(putCalls).toHaveLength(1));
		await flushAsync();

		expect(openCount()).toBe(1);
		expect(client.getReadyState()).toBe("CONNECTED");
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
