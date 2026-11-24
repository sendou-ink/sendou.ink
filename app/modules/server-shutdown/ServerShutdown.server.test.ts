import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { broadcastStreamResponse } from "~/features/broadcast/broadcast-stream.server";
import * as ServerShutdown from "./ServerShutdown.server";

const CLOSE_LIMIT_MS = 2_000;

let server: http.Server | null = null;

afterEach(() => {
	server?.closeAllConnections();
	server?.close();
	server = null;
});

describe("ServerShutdown.shutdown", () => {
	test("lets the HTTP server close while a broadcast stream is open, telling the client it restarts", async () => {
		const url = await listen((request) =>
			broadcastStreamResponse({
				request,
				connect: ({ send }) => send(JSON.stringify({ kind: "heartbeat" })),
			}),
		);
		const stream = await openStream(url);
		await stream.next();

		ServerShutdown.shutdown();
		const closed = closeServer();

		expect(await stream.rest()).toContain('"kind":"restart"');
		await expect(closed).resolves.toBeLessThan(CLOSE_LIMIT_MS);
	});

	test("runs a callback unregistered before it not at all", () => {
		let calls = 0;
		const unregister = ServerShutdown.onShutdown(() => calls++);

		unregister();
		ServerShutdown.shutdown();

		expect(calls).toBe(0);
	});
});

async function listen(handler: (request: Request) => Response) {
	server = http.createServer(async (req, res) => {
		const controller = new AbortController();
		res.on("close", () => controller.abort());
		const response = handler(
			new Request(`http://localhost${req.url}`, { signal: controller.signal }),
		);
		res.writeHead(response.status, Object.fromEntries(response.headers));
		res.flushHeaders();
		for await (const chunk of response.body!) {
			res.write(chunk);
		}
		res.end();
	});
	await new Promise<void>((resolve) => server!.listen(0, resolve));

	return `http://localhost:${(server!.address() as AddressInfo).port}/`;
}

async function openStream(url: string) {
	const response = await fetch(url);
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();

	return {
		next: async () => decoder.decode((await reader.read()).value),
		rest: async () => {
			let text = "";
			while (true) {
				const { value, done } = await reader.read();
				if (done) return text;
				text += decoder.decode(value);
			}
		},
	};
}

/** Closes the server the way `react-router-serve` does on SIGTERM, resolving to how long it took. */
function closeServer() {
	const startedAt = Date.now();

	return new Promise<number>((resolve, reject) =>
		server!.close((error) =>
			error ? reject(error) : resolve(Date.now() - startedAt),
		),
	);
}
