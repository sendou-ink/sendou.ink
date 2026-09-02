import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { eventsClient } from "./events-client";
import {
	useEventStreamCatchUp,
	useEventsConnection,
	useEventsReadyState,
	useEventsTopic,
	useServerEventListener,
} from "./events-hooks";
import type { ServerEvent } from "./events-types";

class FakeEventSource {
	static instances: FakeEventSource[] = [];

	private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

	url: string;

	constructor(url: string) {
		this.url = url;
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (event: MessageEvent) => void) {
		const existing = this.listeners.get(type) ?? new Set();
		existing.add(listener);
		this.listeners.set(type, existing);
	}

	close() {}

	emit(event: object) {
		for (const listener of this.listeners.get("message") ?? []) {
			listener({ data: JSON.stringify(event) } as MessageEvent);
		}
	}

	emitError() {
		for (const listener of this.listeners.get("error") ?? []) {
			listener({} as MessageEvent);
		}
	}
}

const putCalls: Array<{ url: string; topics: string[] }> = [];

beforeEach(() => {
	FakeEventSource.instances = [];
	putCalls.length = 0;
	vi.stubGlobal("EventSource", FakeEventSource);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			putCalls.push({ url, topics: JSON.parse(init.body as string).topics });
			return { status: 200 };
		}),
	);
});

afterEach(() => {
	eventsClient.disconnect();
	vi.unstubAllGlobals();
});

function Harness({ topic }: { topic: string | null }) {
	useEventsConnection(true);
	const readyState = useEventsReadyState();

	return (
		<div>
			<div data-testid="ready-state">{readyState}</div>
			{topic !== null ? <TopicSubscriber topic={topic} /> : null}
		</div>
	);
}

function TopicSubscriber({ topic }: { topic: string }) {
	useEventsTopic(topic);

	return null;
}

const connectedSource = async () => {
	await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
	return FakeEventSource.instances[0];
};

describe("useEventsReadyState", () => {
	test("follows the connection lifecycle", async () => {
		const screen = await render(<Harness topic={null} />);
		const readyState = screen.getByTestId("ready-state");

		await expect.element(readyState).toHaveTextContent("CONNECTING");

		const source = await connectedSource();
		source.emit({ kind: "hello", connectionId: "c1" });
		await expect.element(readyState).toHaveTextContent("CONNECTED");

		source.emitError();
		await expect.element(readyState).toHaveTextContent("CONNECTING");
	});
});

describe("useEventsTopic", () => {
	test("subscribes while mounted and unsubscribes on unmount", async () => {
		const screen = await render(<Harness topic="tournament__5" />);
		const source = await connectedSource();
		source.emit({ kind: "hello", connectionId: "c1" });

		await vi.waitFor(() => expect(putCalls).toHaveLength(1));
		expect(putCalls[0]).toEqual({
			url: "/sse/c1/topics",
			topics: ["tournament__5"],
		});

		await screen.rerender(<Harness topic={null} />);
		await vi.waitFor(() => expect(putCalls).toHaveLength(2));
		expect(putCalls[1].topics).toEqual([]);
	});
});

describe("useServerEventListener", () => {
	test("receives server events", async () => {
		const events: ServerEvent[] = [];
		function Listener() {
			useServerEventListener((event) => events.push(event));

			return null;
		}

		await render(
			<>
				<Harness topic={null} />
				<Listener />
			</>,
		);
		const source = await connectedSource();
		source.emit({ kind: "hello", connectionId: "c1" });
		source.emit({ kind: "roomsChanged" });

		await vi.waitFor(() => expect(events).toEqual([{ kind: "roomsChanged" }]));
	});
});

const CATCH_UP_AWAY_MS = 20 * 1000;
const FOREGROUND_TICK_MS = 5 * 1000;
const EVENTS_DOWN_CATCH_UP_MS = 2 * 60 * 1000;
const CATCH_UP_MAX_JITTER_MS = 3_000;
const LATE_FIRST_CONNECT_MS = 2_000;

let catchUps = 0;
let triggerCatchUp: () => void = () => {};

function CatchUpHarness({ enabled }: { enabled: boolean }) {
	useEventsConnection(true);
	triggerCatchUp = useEventStreamCatchUp({
		enabled,
		onCatchUp: () => {
			catchUps++;
		},
	});

	return null;
}

/**
 * Runs the fake clock forward and lets React paint. React renders through a MessageChannel fake
 * timers don't control, so a message of our own posted afterwards tells us the render happened.
 */
const advanceTimers = async (ms = 0) => {
	await vi.advanceTimersByTimeAsync(ms);

	return new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
};

/** Time passing without the page running, the way a suspended or asleep device does. */
const sleepingDevice = async (ms: number) => {
	vi.setSystemTime(Date.now() + ms);
	await advanceTimers();
};

const setVisibility = (state: DocumentVisibilityState) => {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
	document.dispatchEvent(new Event("visibilitychange"));
};

describe("useEventStreamCatchUp", () => {
	const mountConnecting = async (enabled = true) => {
		const screen = await render(<CatchUpHarness enabled={enabled} />);
		await advanceTimers();

		return screen;
	};

	const helloArrives = async () => {
		FakeEventSource.instances.at(-1)?.emit({
			kind: "hello",
			connectionId: "c1",
		});
		await advanceTimers();
	};

	const streamDrops = async () => {
		FakeEventSource.instances.at(-1)?.emitError();
		await advanceTimers();
	};

	beforeEach(() => {
		catchUps = 0;
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		setVisibility("visible");
	});

	test("does not catch up on the first connect", async () => {
		await mountConnecting();
		await helloArrives();

		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(0);
	});

	test("catches up on a first connect page load did not wait for", async () => {
		await mountConnecting();

		await advanceTimers(LATE_FIRST_CONNECT_MS);
		await helloArrives();
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(1);
	});

	test("does not catch up on the first connect after being enabled", async () => {
		const screen = await mountConnecting(false);

		await advanceTimers(LATE_FIRST_CONNECT_MS);
		await screen.rerender(<CatchUpHarness enabled={true} />);
		await advanceTimers();
		await helloArrives();
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(0);
	});

	test("catches up once the event stream comes back up", async () => {
		await mountConnecting();
		await helloArrives();

		await streamDrops();
		await helloArrives();
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(1);
	});

	test("catches up when returning to a tab that was hidden for a while", async () => {
		await mountConnecting();
		await helloArrives();

		setVisibility("hidden");
		await advanceTimers(CATCH_UP_AWAY_MS);
		setVisibility("visible");
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(1);
	});

	test("does not catch up after a brief tab away", async () => {
		await mountConnecting();
		await helloArrives();

		setVisibility("hidden");
		await advanceTimers(CATCH_UP_AWAY_MS / 2);
		setVisibility("visible");
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(0);
	});

	test("catches up when an app the phone suspended announces it is back", async () => {
		await mountConnecting();
		await helloArrives();

		// suspending stops the page without handing it the hidden transition first
		await sleepingDevice(CATCH_UP_AWAY_MS);
		setVisibility("visible");
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(1);
	});

	test("catches up when the page resumes without announcing it at all", async () => {
		await mountConnecting();
		await helloArrives();

		await sleepingDevice(CATCH_UP_AWAY_MS);
		await advanceTimers(FOREGROUND_TICK_MS + CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(1);
	});

	test("does not catch up while merely sitting in the foreground", async () => {
		await mountConnecting();
		await helloArrives();

		await advanceTimers(CATCH_UP_AWAY_MS * 5);

		expect(catchUps).toBe(0);
	});

	test("catches up on an interval while the event stream is down", async () => {
		await mountConnecting();

		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS + CATCH_UP_MAX_JITTER_MS);
		expect(catchUps).toBe(1);

		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS + CATCH_UP_MAX_JITTER_MS);
		expect(catchUps).toBe(2);
	});

	test("does not poll while the event stream is up", async () => {
		await mountConnecting();
		await helloArrives();

		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS * 3);

		expect(catchUps).toBe(0);
	});

	test("absorbs catch-ups triggered while one is already scheduled", async () => {
		await mountConnecting();
		await helloArrives();

		triggerCatchUp();
		triggerCatchUp();
		triggerCatchUp();
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(1);
	});

	test("does nothing at all when disabled", async () => {
		await mountConnecting(false);
		await helloArrives();

		await streamDrops();
		await helloArrives();
		setVisibility("hidden");
		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS * 3);
		setVisibility("visible");
		await advanceTimers(CATCH_UP_MAX_JITTER_MS);

		expect(catchUps).toBe(0);
	});
});
