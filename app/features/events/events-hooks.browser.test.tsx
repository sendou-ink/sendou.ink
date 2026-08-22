import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { eventsClient } from "./events-client";
import {
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
