import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { EventsReadyState } from "~/features/events/events-client";
import type { ServerEvent } from "~/features/events/events-types";
import { useLiveRevalidation, useServerRevalidationEvents } from "./chat-hooks";

const EVENTS_DOWN_CATCH_UP_MS = 2 * 60 * 1000;
const CATCH_UP_HIDDEN_MS = 20 * 1000;

const mocks = vi.hoisted(() => ({
	scheduleBroadcastRevalidation: vi.fn(),
	user: null as { id: number } | null,
	readyState: "CLOSED" as "CONNECTING" | "CONNECTED" | "CLOSED",
	serverEventListener: null as ((event: unknown) => void) | null,
}));

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => mocks.user,
}));

vi.mock("./revalidation-scope", () => ({
	scheduleBroadcastRevalidation: mocks.scheduleBroadcastRevalidation,
}));

vi.mock("~/features/events/events-hooks", () => ({
	useEventsReadyState: () => mocks.readyState,
	useEventsTopic: () => {},
	useEventsConnection: () => {},
	useServerEventListener: (listener: (event: unknown) => void) => {
		mocks.serverEventListener = listener;
	},
}));

function LiveRevalidator({ enabled }: { enabled: boolean }) {
	useLiveRevalidation(enabled);

	return <div data-testid="live" />;
}

function Harness({ enabled }: { enabled: boolean }) {
	const [, forceRender] = React.useReducer((count) => count + 1, 0);

	return (
		<>
			<LiveRevalidator enabled={enabled} />
			<button
				type="button"
				onClick={() => {
					mocks.readyState = "CLOSED";
					forceRender();
				}}
			>
				drop
			</button>
			<button
				type="button"
				onClick={() => {
					mocks.readyState = "CONNECTED";
					forceRender();
				}}
			>
				reconnect
			</button>
		</>
	);
}

const renderWithRouter = (element: React.ReactElement) =>
	render(
		<RouterProvider router={createMemoryRouter([{ path: "/", element }])} />,
	);

/** `null` stands for a logged out visitor: no event stream to receive from. */
const renderHarness = (
	initialReadyState: EventsReadyState | null,
	enabled = true,
) => {
	mocks.user = initialReadyState === null ? null : { id: 1 };
	mocks.readyState = initialReadyState ?? "CLOSED";

	return renderWithRouter(<Harness enabled={enabled} />);
};

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
	mocks.scheduleBroadcastRevalidation.mockClear();
	mocks.user = null;
	mocks.readyState = "CLOSED";
	mocks.serverEventListener = null;
	setVisibility("visible");
});

describe("useLiveRevalidation - reconnect", () => {
	test("does not revalidate on the first connect", async () => {
		await renderHarness("CONNECTED");

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("revalidates once the event stream comes back up", async () => {
		const screen = await renderHarness("CONNECTED");

		await screen.getByRole("button", { name: "drop" }).click();
		await screen.getByRole("button", { name: "reconnect" }).click();

		await expect
			.poll(() => mocks.scheduleBroadcastRevalidation.mock.calls.length)
			.toBe(1);
	});

	test("does not revalidate on reconnect when disabled", async () => {
		const screen = await renderHarness("CONNECTED", false);

		await screen.getByRole("button", { name: "drop" }).click();
		await screen.getByRole("button", { name: "reconnect" }).click();

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
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

		expect(mocks.scheduleBroadcastRevalidation).toHaveBeenCalledTimes(1);
	});

	test("does not revalidate after a brief tab away", async () => {
		await renderHarness("CONNECTED");

		setVisibility("hidden");
		await advanceTimers(CATCH_UP_HIDDEN_MS / 2);
		setVisibility("visible");

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("revalidates on an interval while the event stream is down", async () => {
		await renderHarness("CLOSED");

		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS);
		expect(mocks.scheduleBroadcastRevalidation).toHaveBeenCalledTimes(1);

		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS);
		expect(mocks.scheduleBroadcastRevalidation).toHaveBeenCalledTimes(2);
	});

	test("does not poll while the event stream is up", async () => {
		await renderHarness("CONNECTED");

		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS * 3);

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("does nothing at all for a logged out visitor", async () => {
		await renderHarness(null);

		setVisibility("hidden");
		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS * 3);
		setVisibility("visible");

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("does nothing at all when disabled", async () => {
		await renderHarness("CLOSED", false);

		setVisibility("hidden");
		await advanceTimers(EVENTS_DOWN_CATCH_UP_MS * 3);
		setVisibility("visible");

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});
});

function RevalidationEvents() {
	useServerRevalidationEvents(1);

	return null;
}

const emitServerEvent = (event: ServerEvent) => {
	mocks.serverEventListener?.(event);
};

describe("useServerRevalidationEvents", () => {
	test("schedules a revalidation for another actor's broadcast", async () => {
		await renderWithRouter(<RevalidationEvents />);

		emitServerEvent({
			kind: "revalidate",
			scope: "MATCH_RESULTS",
			authorUserId: 2,
		});

		expect(mocks.scheduleBroadcastRevalidation).toHaveBeenCalledWith(
			expect.any(Function),
			"MATCH_RESULTS",
		);
	});

	test("skips the current user's own broadcast", async () => {
		await renderWithRouter(<RevalidationEvents />);

		emitServerEvent({ kind: "revalidate", authorUserId: 1 });

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});

	test("ignores events of other kinds", async () => {
		await renderWithRouter(<RevalidationEvents />);

		emitServerEvent({ kind: "notificationsChanged" });

		expect(mocks.scheduleBroadcastRevalidation).not.toHaveBeenCalled();
	});
});
