import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import {
	BROADCAST_HEARTBEAT_INTERVAL_MS,
	BROADCAST_STATE_VERSION,
	DEFAULT_BROADCAST_SETTINGS,
} from "./broadcast-constants";
import { useBroadcastStream } from "./broadcast-hooks";
import type { BroadcastState, BroadcastStreamMessage } from "./broadcast-types";
import * as Producer from "./core/Producer";

const URL = "/to/1/broadcast/sendouink/stream";
const MAX_REOPEN_DELAY_MS = 5_000;

class FakeEventSource {
	static readonly CLOSED = 2;
	static instances: FakeEventSource[] = [];

	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	readyState = 0;
	isClosed = false;

	url: string;

	constructor(url: string) {
		this.url = url;
		FakeEventSource.instances.push(this);
	}

	close() {
		this.isClosed = true;
		this.readyState = FakeEventSource.CLOSED;
	}

	emit(
		message: BroadcastStreamMessage | { kind: string; [key: string]: unknown },
	) {
		this.readyState = 1;
		this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
	}

	/** `gaveUp`: the browser won't reconnect by itself, e.g. after a 502. */
	fail({ gaveUp }: { gaveUp: boolean }) {
		this.readyState = gaveUp ? FakeEventSource.CLOSED : 0;
		this.onerror?.();
	}
}

beforeEach(() => {
	FakeEventSource.instances = [];
	vi.stubGlobal("EventSource", FakeEventSource);
	vi.useFakeTimers({
		toFake: [
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
			"Date",
		],
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("useBroadcastStream", () => {
	test("keeps the last state while the stream is down and shows the server's state once it reconnects", async () => {
		const screen = await mount();
		connectWith(latest(), 1);

		latest().fail({ gaveUp: true });
		await advance(0);
		expect(shown(screen)).toEqual({ status: "lost", takeId: "1" });

		await advance(MAX_REOPEN_DELAY_MS);
		connectWith(latest(), 2);
		await advance(0);

		expect(shown(screen)).toEqual({ status: "connected", takeId: "2" });
	});

	test("tells a server restarting apart from a dropped connection, and connects again", async () => {
		const screen = await mount();
		connectWith(latest(), 1);

		latest().emit({ kind: "restart" });
		await advance(0);
		expect(shown(screen).status).toBe("lost restarting");

		await advance(MAX_REOPEN_DELAY_MS);
		expect(FakeEventSource.instances).toHaveLength(2);
		connectWith(latest(), 1);
		await advance(0);
		expect(shown(screen).status).toBe("connected");
	});

	test("tries again at most 5 seconds apart however long the server is down", async () => {
		await mount();
		connectWith(latest(), 1);

		for (let attempt = 0; attempt < 10; attempt++) {
			const before = FakeEventSource.instances.length;
			latest().fail({ gaveUp: true });
			await advance(MAX_REOPEN_DELAY_MS);
			expect(FakeEventSource.instances).toHaveLength(before + 1);
		}
	});

	test("reopens a connection silent for two and a half heartbeats", async () => {
		await mount();
		connectWith(latest(), 1);

		await advance(BROADCAST_HEARTBEAT_INTERVAL_MS * 2);
		latest().emit({ kind: "heartbeat" });
		await advance(BROADCAST_HEARTBEAT_INTERVAL_MS * 2);
		expect(FakeEventSource.instances).toHaveLength(1);

		await advance(BROADCAST_HEARTBEAT_INTERVAL_MS + MAX_REOPEN_DELAY_MS);
		expect(FakeEventSource.instances).toHaveLength(2);
		expect(FakeEventSource.instances[0].isClosed).toBe(true);
	});

	test("connects again right away when the browser is back online", async () => {
		await mount();
		connectWith(latest(), 1);
		latest().fail({ gaveUp: false });

		window.dispatchEvent(new Event("online"));

		expect(FakeEventSource.instances).toHaveLength(2);
	});

	test("doesn't show a state of another version, telling the page is out of date", async () => {
		const screen = await mount();
		connectWith(latest(), 1);

		latest().emit({ ...hello(), v: BROADCAST_STATE_VERSION + 1 });
		latest().emit({
			kind: "state",
			state: { ...stateWith(2), v: BROADCAST_STATE_VERSION + 1 },
		});
		await advance(0);

		expect(shown(screen)).toEqual({
			status: "connected outdated",
			takeId: "1",
		});
	});

	test("opens a new connection when told to reconnect", async () => {
		await mount();
		connectWith(latest(), 1);

		latest().emit({ kind: "reconnect" });
		await advance(MAX_REOPEN_DELAY_MS);

		expect(FakeEventSource.instances).toHaveLength(2);
		expect(FakeEventSource.instances[0].isClosed).toBe(true);
	});
});

function Harness() {
	const { state, connection, isOutdated } = useBroadcastStream({
		url: URL,
		initialState: stateWith(0),
	});

	return (
		<div>
			<span data-testid="status">
				{connection.status}
				{connection.status === "lost" && connection.isRestarting
					? " restarting"
					: ""}
				{isOutdated ? " outdated" : ""}
			</span>
			<span data-testid="take-id">{state.takeId}</span>
		</div>
	);
}

async function mount() {
	const screen = await render(<Harness />);
	await advance(0);
	expect(FakeEventSource.instances).toHaveLength(1);

	return screen;
}

function latest() {
	return FakeEventSource.instances.at(-1)!;
}

function connectWith(source: FakeEventSource, takeId: number) {
	source.emit(hello());
	source.emit({ kind: "state", state: stateWith(takeId) });
}

function shown(screen: Awaited<ReturnType<typeof render>>) {
	return {
		status: screen.getByTestId("status").element().textContent,
		takeId: screen.getByTestId("take-id").element().textContent,
	};
}

/** Advances the timers and lets React render what they changed. */
async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	await new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
}

function hello() {
	return {
		kind: "hello",
		peer: { id: "peer", token: "token" },
		now: Date.now(),
		broadcast: { tournamentId: 1, slug: "sendouink" },
		v: BROADCAST_STATE_VERSION,
		build: "",
	} satisfies BroadcastStreamMessage;
}

function stateWith(takeId: number): BroadcastState {
	return {
		...Producer.initialState(CAST_PRODUCER_RULES),
		takeId,
		v: BROADCAST_STATE_VERSION,
		settings: DEFAULT_BROADCAST_SETTINGS,
		tournament: { name: "Tournament", logoUrl: "", organizationName: null },
		match: null,
		health: { sources: 1, scanners: 0 },
	};
}
