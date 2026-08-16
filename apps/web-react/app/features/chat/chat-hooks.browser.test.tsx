import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useLiveRevalidation } from "./chat-hooks";
import type { ChatContextValue } from "./chat-provider-types";
import { ChatContext } from "./useChatContext";

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

const { scheduleBroadcastRevalidation } = vi.hoisted(() => ({
	scheduleBroadcastRevalidation: vi.fn(),
}));

vi.mock("./revalidation-scope", () => ({ scheduleBroadcastRevalidation }));

const WS_DOWN_CATCH_UP_MS = 2 * 60 * 1000;
const CATCH_UP_HIDDEN_MS = 20 * 1000;

type ReadyState = ChatContextValue["readyState"];

function LiveRevalidator({ enabled }: { enabled: boolean }) {
	useLiveRevalidation(enabled);

	return <div data-testid="live" />;
}

function Harness({
	initialReadyState,
	enabled,
}: {
	initialReadyState: ReadyState | null;
	enabled: boolean;
}) {
	const [readyState, setReadyState] = React.useState(initialReadyState);

	return (
		<ChatContext.Provider
			value={readyState === null ? null : ({ readyState } as ChatContextValue)}
		>
			<LiveRevalidator enabled={enabled} />
			<button type="button" onClick={() => setReadyState("CLOSED")}>
				drop
			</button>
			<button type="button" onClick={() => setReadyState("CONNECTED")}>
				reconnect
			</button>
		</ChatContext.Provider>
	);
}

/** `null` stands for a logged out visitor: no chat provider, so no context. */
const renderHarness = (initialReadyState: ReadyState | null, enabled = true) =>
	render(
		<RouterProvider
			router={createMemoryRouter([
				{
					path: "/",
					element: (
						<Harness initialReadyState={initialReadyState} enabled={enabled} />
					),
				},
			])}
		/>,
	);

const setVisibility = (state: DocumentVisibilityState) => {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
	document.dispatchEvent(new Event("visibilitychange"));
};

/**
 * Runs the fake clock forward and lets React paint what the fired timers
 * changed. React schedules its render through a MessageChannel, which fake
 * timers do not control, so a message of our own posted afterwards is what
 * tells us the render already happened.
 */
const advanceTimers = async (ms: number) => {
	await vi.advanceTimersByTimeAsync(ms);

	return new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
};

afterEach(() => {
	scheduleBroadcastRevalidation.mockClear();
	setVisibility("visible");
});

describe("useLiveRevalidation - reconnect", () => {
	test("does not revalidate on the first connect", async () => {
		await renderHarness("CONNECTED");

		expect(scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("revalidates once the websocket comes back up", async () => {
		const screen = await renderHarness("CONNECTED");

		await screen.getByRole("button", { name: "drop" }).click();
		await screen.getByRole("button", { name: "reconnect" }).click();

		await expect
			.poll(() => scheduleBroadcastRevalidation.mock.calls.length)
			.toBe(1);
	});

	test("does not revalidate on reconnect when disabled", async () => {
		const screen = await renderHarness("CONNECTED", false);

		await screen.getByRole("button", { name: "drop" }).click();
		await screen.getByRole("button", { name: "reconnect" }).click();

		expect(scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});
});

describe("useLiveRevalidation - visibility and fallback poll", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("revalidates when returning to a tab that was hidden for a while", async () => {
		await renderHarness("CONNECTED");

		setVisibility("hidden");
		await advanceTimers(CATCH_UP_HIDDEN_MS);
		setVisibility("visible");

		expect(scheduleBroadcastRevalidation).toHaveBeenCalledTimes(1);
	});

	test("does not revalidate after a brief tab away", async () => {
		await renderHarness("CONNECTED");

		setVisibility("hidden");
		await advanceTimers(CATCH_UP_HIDDEN_MS / 2);
		setVisibility("visible");

		expect(scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("revalidates on an interval while the websocket is down", async () => {
		await renderHarness("CLOSED");

		await advanceTimers(WS_DOWN_CATCH_UP_MS);
		expect(scheduleBroadcastRevalidation).toHaveBeenCalledTimes(1);

		await advanceTimers(WS_DOWN_CATCH_UP_MS);
		expect(scheduleBroadcastRevalidation).toHaveBeenCalledTimes(2);
	});

	test("does not poll while the websocket is up", async () => {
		await renderHarness("CONNECTED");

		await advanceTimers(WS_DOWN_CATCH_UP_MS * 3);

		expect(scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("does nothing at all without a chat provider", async () => {
		await renderHarness(null);

		setVisibility("hidden");
		await advanceTimers(WS_DOWN_CATCH_UP_MS * 3);
		setVisibility("visible");

		expect(scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("does nothing at all when disabled", async () => {
		await renderHarness("CLOSED", false);

		setVisibility("hidden");
		await advanceTimers(WS_DOWN_CATCH_UP_MS * 3);
		setVisibility("visible");

		expect(scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});
});
