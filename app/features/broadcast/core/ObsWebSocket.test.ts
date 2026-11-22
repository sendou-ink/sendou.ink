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

describe("ObsWebSocket.listCaptureCardSources", () => {
	beforeEach(() => {
		FakeWebSocket.instances = [];
		vi.useFakeTimers();
		vi.stubGlobal("WebSocket", FakeWebSocket);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	async function answerInputList(inputs: unknown[]) {
		lastSocket().receive({ op: 0, d: {} });
		await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
		lastSocket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });
		lastSocket().receive({
			op: 7,
			d: {
				requestType: "GetInputList",
				requestStatus: { result: true, code: 100 },
				responseData: { inputs },
			},
		});
	}

	test("asks OBS for its inputs once identified", async () => {
		void ObsWebSocket.listCaptureCardSources({ port: 4455, password: null });

		lastSocket().receive({ op: 0, d: {} });
		await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
		lastSocket().receive({ op: 2, d: { negotiatedRpcVersion: 1 } });

		expect(lastSocket().sent[1]).toEqual({
			op: 6,
			d: { requestType: "GetInputList", requestId: "1", requestData: {} },
		});
	});

	test("lists only the capture devices", async () => {
		const result = ObsWebSocket.listCaptureCardSources({
			port: 4455,
			password: null,
		});

		await answerInputList([
			{
				inputName: "Overlay",
				inputKind: "browser_source",
				unversionedInputKind: "browser_source",
			},
			{
				inputName: "Elgato HD60",
				inputKind: "av_capture_input_v2",
				unversionedInputKind: "av_capture_input",
			},
			{
				inputName: "Card audio",
				inputKind: "wasapi_input_capture",
				unversionedInputKind: "wasapi_input_capture",
			},
		]);

		await expect(result).resolves.toEqual({
			type: "sources",
			names: ["Elgato HD60", "Card audio"],
		});
	});

	test("lists every source when none is a capture device", async () => {
		const result = ObsWebSocket.listCaptureCardSources({
			port: 4455,
			password: null,
		});

		await answerInputList([
			{
				inputName: "Overlay",
				inputKind: "browser_source",
				unversionedInputKind: "browser_source",
			},
			{
				inputName: "NDI feed",
				inputKind: "ndi_source",
				unversionedInputKind: "ndi_source",
			},
		]);

		await expect(result).resolves.toEqual({
			type: "sources",
			names: ["Overlay", "NDI feed"],
		});
	});

	test("closes the connection once answered", async () => {
		const result = ObsWebSocket.listCaptureCardSources({
			port: 4455,
			password: null,
		});
		const close = vi.spyOn(lastSocket(), "close");

		await answerInputList([]);
		await result;

		expect(close).toHaveBeenCalledOnce();
	});

	test.each([
		{ why: "the password is wrong", code: 4009, type: "wrong-password" },
		{ why: "OBS isn't reachable", code: 1006, type: "unreachable" },
	])("tells when $why", async ({ code, type }) => {
		const result = ObsWebSocket.listCaptureCardSources({
			port: 4455,
			password: "x",
		});

		lastSocket().onclose?.({ code });

		await expect(result).resolves.toEqual({ type });
	});

	test("gives up when OBS doesn't answer", async () => {
		const result = ObsWebSocket.listCaptureCardSources({
			port: 4455,
			password: null,
		});

		vi.runOnlyPendingTimers();

		await expect(result).resolves.toEqual({ type: "unreachable" });
	});
});
