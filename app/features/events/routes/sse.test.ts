import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { withUserId } from "~/utils/Test";
import * as EventBus from "../core/EventBus.server";
import { userChannel } from "../events-types";
import { HEARTBEAT_INTERVAL_MS, loader } from "./sse";
import { action } from "./sse.$connectionId.topics";

const openedStreams: Array<() => void> = [];

afterEach(() => {
	for (const abort of openedStreams) {
		abort();
	}
	openedStreams.length = 0;
});

describe("sse loader", () => {
	test("streams hello with the connection id as the first event", async () => {
		const stream = openStream(11);

		const hello = await stream.nextEvent();
		expect(hello.kind).toBe("hello");
		expect(typeof hello.connectionId).toBe("string");
	});

	test("delivers events published to the user's own channel", async () => {
		const stream = openStream(11);
		await stream.nextEvent();

		EventBus.publish([userChannel(11)], {
			kind: "notificationsChanged",
		});

		expect(await stream.nextEvent()).toEqual({ kind: "notificationsChanged" });
	});

	test("does not deliver another user's channel events", async () => {
		const stream = openStream(11);
		await stream.nextEvent();

		EventBus.publish([userChannel(12)], {
			kind: "notificationsChanged",
		});
		EventBus.publish([userChannel(11)], { kind: "roomsChanged" });

		expect(await stream.nextEvent()).toEqual({ kind: "roomsChanged" });
	});

	test("closes the stream and unregisters the connection on abort", async () => {
		const stream = openStream(11);
		const hello = await stream.nextEvent();

		stream.abort();

		await vi.waitFor(() => {
			expect(EventBus.subscriberCount(userChannel(11))).toBe(0);
		});
		await expect(stream.ended()).resolves.toBe(true);
		expect(await putTopicsStatus(11, hello.connectionId, ["sq-looking"])).toBe(
			404,
		);
	});
});

describe("sse heartbeat", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test("writes a comment frame every interval", async () => {
		vi.useFakeTimers();
		const stream = openStream(11);
		await stream.nextChunk();

		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

		expect(await stream.nextChunk()).toBe(": heartbeat\n\n");
	});

	test("clears the interval when the connection closes", async () => {
		vi.useFakeTimers();
		const idleTimerCount = vi.getTimerCount();
		const stream = openStream(11);
		await stream.nextChunk();
		expect(vi.getTimerCount()).toBe(idleTimerCount + 1);

		stream.abort();
		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);

		expect(vi.getTimerCount()).toBe(idleTimerCount);
		await expect(stream.ended()).resolves.toBe(true);
	});
});

describe("sse topics action", () => {
	test("subscribes the connection to the sent topics", async () => {
		const stream = openStream(11);
		const hello = await stream.nextEvent();

		expect(
			await putTopicsStatus(11, hello.connectionId, ["tournament__5"]),
		).toBe(200);
		await vi.waitFor(() => {
			expect(EventBus.subscriberCount("tournament__5")).toBe(1);
		});

		EventBus.publish(["tournament__5"], { kind: "revalidate" });

		expect(await stream.nextEvent()).toEqual({ kind: "revalidate" });
	});

	test("replaces the topic set wholesale", async () => {
		const stream = openStream(11);
		const hello = await stream.nextEvent();

		await putTopicsStatus(11, hello.connectionId, ["tournament__5"]);
		await vi.waitFor(() => {
			expect(EventBus.subscriberCount("tournament__5")).toBe(1);
		});

		await putTopicsStatus(11, hello.connectionId, ["match__9"]);
		await vi.waitFor(() => {
			expect(EventBus.subscriberCount("tournament__5")).toBe(0);
			expect(EventBus.subscriberCount("match__9")).toBe(1);
		});

		EventBus.publish(["tournament__5"], {
			kind: "revalidate",
			authorUserId: 1,
		});
		EventBus.publish(["match__9"], { kind: "revalidate", authorUserId: 2 });

		expect(await stream.nextEvent()).toEqual({
			kind: "revalidate",
			authorUserId: 2,
		});
	});

	test("404s for an unknown connection id", async () => {
		expect(
			await putTopicsStatus(11, "no-such-connection", ["sq-looking"]),
		).toBe(404);
	});

	test("404s for another user's connection", async () => {
		const stream = openStream(11);
		const hello = await stream.nextEvent();

		expect(await putTopicsStatus(12, hello.connectionId, ["sq-looking"])).toBe(
			404,
		);
	});

	test.each([{ topic: "user__11" }, { topic: "chat-room__1" }])(
		"403s a $topic topic",
		async ({ topic }) => {
			const stream = openStream(11);
			const hello = await stream.nextEvent();

			expect(await putTopicsStatus(11, hello.connectionId, [topic])).toBe(403);
		},
	);

	test("405s non-PUT requests", async () => {
		const request = new Request("http://app.com/sse/xxx/topics", {
			method: "POST",
			body: JSON.stringify({ topics: [] }),
			headers: [["Content-Type", "application/json"]],
		});

		expect(
			await statusOf(
				withUserId(11, () =>
					action({
						request,
						params: { connectionId: "xxx" },
						context: {} as any,
						pattern: "",
						url: new URL(request.url),
					} as ActionFunctionArgs),
				),
			),
		).toBe(405);
	});
});

function openStream(userId: number) {
	const controller = new AbortController();
	const request = new Request("http://app.com/sse", {
		signal: controller.signal,
	});
	const response = withUserId(userId, () =>
		loader({
			request,
			params: {},
			context: {} as any,
			pattern: "",
			url: new URL(request.url),
		} as LoaderFunctionArgs),
	) as Response;
	openedStreams.push(() => controller.abort());

	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const pendingEvents: any[] = [];

	return {
		nextEvent: async (timeoutMs = 1000) => {
			while (pendingEvents.length === 0) {
				const result = await Promise.race([
					reader.read(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("timed out waiting for an SSE event")),
							timeoutMs,
						),
					),
				]);
				if (result.done) {
					throw new Error("stream ended while waiting for an SSE event");
				}

				buffer += decoder.decode(result.value, { stream: true });
				const frames = buffer.split("\n\n");
				buffer = frames.pop() ?? "";
				for (const frame of frames) {
					if (frame.startsWith("data: ")) {
						pendingEvents.push(JSON.parse(frame.slice("data: ".length)));
					}
				}
			}

			return pendingEvents.shift();
		},
		/** Raw stream text of the next chunk, comment frames included. */
		nextChunk: async () => {
			const result = await reader.read();
			if (result.done) {
				throw new Error("stream ended while waiting for a chunk");
			}

			return decoder.decode(result.value, { stream: true });
		},
		ended: async () => {
			const result = await reader.read();
			return result.done;
		},
		abort: () => controller.abort(),
	};
}

function putTopicsStatus(
	userId: number,
	connectionId: string,
	topics: string[],
) {
	const request = new Request("http://app.com/sse/topics", {
		method: "PUT",
		body: JSON.stringify({ topics }),
		headers: [["Content-Type", "application/json"]],
	});

	return statusOf(
		withUserId(userId, () =>
			action({
				request,
				params: { connectionId },
				context: {} as any,
				pattern: "",
				url: new URL(request.url),
			} as ActionFunctionArgs),
		),
	);
}

async function statusOf(promise: Promise<unknown>) {
	try {
		await promise;
		return 200;
	} catch (thrown) {
		if (thrown instanceof Response) return thrown.status;
		throw thrown;
	}
}
