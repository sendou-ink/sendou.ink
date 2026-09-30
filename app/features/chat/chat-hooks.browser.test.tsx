import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ServerEvent } from "~/features/events/events-types";
import { useLiveRevalidation, useServerRevalidationEvents } from "./chat-hooks";

const mocks = vi.hoisted(() => ({
	revalidateWithScope: vi.fn(),
	scheduleBroadcastRevalidation: vi.fn(),
	user: null as { id: number } | null,
	catchUpOptions: null as {
		enabled: boolean;
		onCatchUp: () => void;
	} | null,
	serverEventListener: null as ((event: unknown) => void) | null,
}));

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => mocks.user,
}));

vi.mock("./revalidation-scope", () => ({
	revalidateWithScope: mocks.revalidateWithScope,
	scheduleBroadcastRevalidation: mocks.scheduleBroadcastRevalidation,
}));

vi.mock("~/features/events/events-hooks", () => ({
	useEventsTopic: () => {},
	useEventStreamCatchUp: (options: {
		enabled: boolean;
		onCatchUp: () => void;
	}) => {
		mocks.catchUpOptions = options;
		return () => {};
	},
	useServerEventListener: (listener: (event: unknown) => void) => {
		mocks.serverEventListener = listener;
	},
}));

const renderWithRouter = (element: React.ReactElement) =>
	render(
		<RouterProvider router={createMemoryRouter([{ path: "/", element }])} />,
	);

afterEach(() => {
	mocks.revalidateWithScope.mockClear();
	mocks.scheduleBroadcastRevalidation.mockClear();
	mocks.user = null;
	mocks.catchUpOptions = null;
	mocks.serverEventListener = null;
});

function LiveRevalidator({ enabled }: { enabled: boolean }) {
	useLiveRevalidation(enabled);

	return null;
}

describe("useLiveRevalidation", () => {
	test.each([
		{ why: "logged in and enabled", user: { id: 1 }, enabled: true, on: true },
		{ why: "logged out visitor", user: null, enabled: true, on: false },
		{ why: "explicitly disabled", user: { id: 1 }, enabled: false, on: false },
	])("catching up is $on for a $why", async ({ user, enabled, on }) => {
		mocks.user = user;

		await renderWithRouter(<LiveRevalidator enabled={enabled} />);

		expect(mocks.catchUpOptions?.enabled).toBe(on);
	});

	test("a catch-up revalidates unscoped, without the broadcast jitter on top", async () => {
		mocks.user = { id: 1 };

		await renderWithRouter(<LiveRevalidator enabled />);
		mocks.catchUpOptions?.onCatchUp();

		expect(mocks.revalidateWithScope).toHaveBeenCalledWith(
			expect.any(Function),
			undefined,
		);
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
