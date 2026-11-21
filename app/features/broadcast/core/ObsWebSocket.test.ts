import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as ObsWebSocket from "./ObsWebSocket";

class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	sent: Array<{ op: number; d: Record<string, unknown> }> = [];
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: ((event: { code: number }) => void) | null = null;

	readonly url: string;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	send(data: string) {
		this.sent.push(JSON.parse(data));
	}

	close() {
		this.onclose?.({ code: 1000 });
	}

	receive(message: unknown) {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
}

const lastSocket = () => FakeWebSocket.instances.at(-1)!;

function sha256Base64(value: string) {
	return createHash("sha256").update(value).digest("base64");
}

describe("ObsWebSocket.authenticationString", () => {
	test("hashes the password with the salt, then with the challenge", async () => {
		const expected = sha256Base64(
			`${sha256Base64("supersecretsalty")}challenging`,
		);

		await expect(
			ObsWebSocket.authenticationString({
				password: "supersecret",
				salt: "salty",
				challenge: "challenging",
			}),
		).resolves.toBe(expected);
	});
});

describe("ObsWebSocket.connect", () => {
	beforeEach(() => {
		FakeWebSocket.instances = [];
		vi.useFakeTimers();
		vi.stubGlobal("WebSocket", FakeWebSocket);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test("connects to OBS on this machine at the port", () => {
		ObsWebSocket.connect({ port: 4466, password: null, onIdentified: vi.fn() });

		expect(lastSocket().url).toBe("ws://127.0.0.1:4466");
	});

	test("identifies with the authentication string OBS asks for", async () => {
		ObsWebSocket.connect({
			port: 4455,
			password: "pw",
			onIdentified: vi.fn(),
		});

		lastSocket().receive({
			op: 0,
			d: { authentication: { challenge: "c", salt: "s" } },
		});
		await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));

		expect(lastSocket().sent[0]).toEqual({
			op: 1,
			d: {
				rpcVersion: 1,
				eventSubscriptions: 0,
				authentication: sha256Base64(`${sha256Base64("pws")}c`),
			},
		});
	});

	test("identifies without authentication when OBS asks for none", async () => {
		ObsWebSocket.connect({ port: 4455, password: null, onIdentified: vi.fn() });

		lastSocket().receive({ op: 0, d: {} });
		await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));

		expect(lastSocket().sent[0]).toEqual({
			op: 1,
			d: { rpcVersion: 1, eventSubscriptions: 0 },
		});
	});

	test("drops requests until identified, then sends them", () => {
		const onIdentified = vi.fn();
		const connection = ObsWebSocket.connect({
			port: 4455,
			password: null,
			onIdentified,
		});

		connection.request("SetInputMute", { inputName: "Capture" });
		expect(lastSocket().sent).toHaveLength(0);

		lastSocket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });
		expect(onIdentified).toHaveBeenCalledOnce();

		connection.request("SetInputMute", { inputName: "Capture" });
		expect(lastSocket().sent).toEqual([
			{
				op: 6,
				d: {
					requestType: "SetInputMute",
					requestId: "1",
					requestData: { inputName: "Capture" },
				},
			},
		]);
	});

	test("connects again after the connection drops", () => {
		ObsWebSocket.connect({ port: 4455, password: null, onIdentified: vi.fn() });

		lastSocket().onclose?.({ code: 1006 });
		vi.runOnlyPendingTimers();

		expect(FakeWebSocket.instances).toHaveLength(2);
	});

	test("doesn't connect again after a wrong password", () => {
		ObsWebSocket.connect({ port: 4455, password: "x", onIdentified: vi.fn() });

		lastSocket().onclose?.({ code: 4009 });
		vi.runOnlyPendingTimers();

		expect(FakeWebSocket.instances).toHaveLength(1);
	});

	test("doesn't connect again once closed", () => {
		const connection = ObsWebSocket.connect({
			port: 4455,
			password: null,
			onIdentified: vi.fn(),
		});

		connection.close();
		vi.runOnlyPendingTimers();

		expect(FakeWebSocket.instances).toHaveLength(1);
	});
});
